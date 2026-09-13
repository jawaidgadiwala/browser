#!/usr/bin/env python3
"""Clean module for BrowserOS build system"""

from pathlib import Path

from ...core.resume import remove_checkpoint_dirs
from ...core.step import Step, ValidationError, step
from ...core.context import Context
from ...lib.utils import run_command, log_info, log_success, log_warning, safe_rmtree
from ..storage.download import managed_binary_families

UNIVERSAL_INPUT_ARCHITECTURES = ("arm64", "x64")

# Top-level directories `git clean` is pointed at; only gclient deps that live
# under one of them need protecting.
CLEANED_DIRS = ("chrome/", "components/", "third_party/")

# Hand-maintained excludes, kept as the fallback for when DEPS cannot be
# parsed. gclient hook downloads (llvm, rust, node, ninja) are untracked in the
# Chromium git tree, so without these every clean forces a full
# `gclient runhooks` before gn can configure.
FALLBACK_CLEAN_EXCLUDES = (
    "build_tools/",
    "uc_staging/",
    "buildtools/",
    "tools/",
    "build/",
    "third_party/llvm-build/",
    "third_party/rust-toolchain/",
    "third_party/rust-src/",
    "third_party/node/",
    "third_party/depot_tools/",
    "third_party/ninja/",
)

# Safety net: build 13 failed at gn configure because this CIPD package was
# swept away (chrome/test/BUILD.gn loads its BUILD.gn). Pinned explicitly so a
# regression in DEPS parsing cannot reintroduce that failure.
ALWAYS_CLEAN_EXCLUDES = ("components/variations/test_data/cipd/",)

# --keep-out only: the Sparkle/WinSparkle vendor dirs are untracked in the
# Chromium tree, so `git clean -fdx third_party/` sweeps them away even though
# --keep-out deliberately skips deleting them. Without these excludes,
# `--keep-out --skip sparkle_setup` fails at compile with
# "third_party/sparkle/Sparkle.framework ... missing and no known rule to make
# it". Not applied by default, where the clean step deletes them on purpose and
# sparkle_setup re-downloads them.
#
# These dirs hold two different kinds of file: the downloaded SDK payload
# (Sparkle.framework, bin/, include/, x64/Release/, ...) which is what we want
# to keep, and files our own patch series CREATES (BUILD.gn, README.browseros).
# Keeping the latter makes the next run's `patches` step fail — "Failed to
# apply 2 patches: third_party/winsparkle/BUILD.gn,
# third_party/winsparkle/README.browseros" — so the step deletes exactly those
# again after the git clean. The set is derived from chromium_patches/, never
# hand-listed, so adding or dropping a vendor patch needs no change here.
KEEP_OUT_VENDOR_DIRS = ("third_party/sparkle", "third_party/winsparkle")
KEEP_OUT_CLEAN_EXCLUDES = tuple(f"{path}/" for path in KEEP_OUT_VENDOR_DIRS)


def _patch_creates_file(patch_path: Path) -> bool:
    """True when the patch is a git diff that adds a new file.

    Read as the applier does — the header is at the top, so only the first
    few lines are inspected; an unreadable patch is treated as "not a new
    file" and left alone rather than deleting its target.
    """
    try:
        with open(patch_path, "r", encoding="utf-8", errors="replace") as stream:
            for _ in range(5):
                line = stream.readline()
                if not line:
                    break
                if line.startswith("new file mode"):
                    return True
    except OSError as error:
        log_warning(f"Could not read patch {patch_path}: {error}")
    return False


def gclient_managed_paths(deps_path: Path) -> tuple[str, ...]:
    """Return src-relative paths DEPS declares as gclient-managed dependencies.

    CIPD packages and GCS downloads are untracked in the Chromium git tree, so
    `git clean -fdx` deletes them; upstream CI hides this by always running
    `gclient sync` afterwards, while local `--provision none` builds do not.
    The DEPS file is a Python dict literal that calls `Var`/`Str`, so it is
    exec'd with those stubbed the way gclient does rather than pattern-matched.

    Only paths under CLEANED_DIRS are returned. An empty tuple means "unknown"
    (missing or unparseable DEPS), never "nothing is managed".
    """
    try:
        source = deps_path.read_text(encoding="utf-8")
    except OSError as error:
        log_warning(f"Could not read {deps_path}: {error}")
        return ()

    namespace: dict = {
        # gclient's own stubs: Var() expands to a placeholder (we only need the
        # dict keys, never the resolved URLs) and Str() is the identity.
        "Var": lambda name: "{%s}" % name,
        "Str": lambda value: value,
    }
    try:
        exec(compile(source, str(deps_path), "exec"), namespace)  # noqa: S102
    except Exception as error:  # DEPS is third-party code; any failure is fatal
        log_warning(f"Could not evaluate {deps_path}: {error!r}")
        return ()

    deps = namespace.get("deps")
    if not isinstance(deps, dict):
        log_warning(f"No deps dict found in {deps_path}")
        return ()

    paths: set[str] = set()
    for key in deps:
        if not isinstance(key, str) or not key.startswith("src/"):
            continue
        relative = key[len("src/") :].strip("/")
        if relative.startswith(CLEANED_DIRS):
            paths.add(relative)
    return tuple(sorted(paths))


@step("clean", phase="setup")
class CleanModule(Step):
    produces = []
    requires = []
    description = "Clean build artifacts, reset git state, and prune orphaned resources"

    def validate(self, ctx: Context) -> None:
        if not ctx.chromium_src.exists():
            raise ValidationError(f"Chromium source not found: {ctx.chromium_src}")

    def execute(self, ctx: Context) -> None:
        if ctx.keep_out:
            # Patch-iteration mode: the git reset/clean below still returns the
            # tree to pristine so patches re-apply, but the output directory
            # (and its ninja/siso state) survives, so the build after it
            # recompiles only what the new patch set actually changed.
            log_warning(
                "⏭️  --keep-out: leaving build output directories in place "
                "(incremental rebuild; never use for a release build)"
            )
            for out_path in self._output_dirs(ctx):
                if out_path.exists():
                    log_info(
                        "   Kept build directory: "
                        f"{out_path.relative_to(ctx.chromium_src)}"
                    )
        else:
            log_info("🧹 Cleaning build artifacts...")

            for out_path in self._output_dirs(ctx):
                if not out_path.exists():
                    continue
                safe_rmtree(out_path)
                log_success(
                    f"Cleaned build directory: {out_path.relative_to(ctx.chromium_src)}"
                )
        # Checkpoints attest a tree state the reset below is about to destroy,
        # so they go even in --keep-out mode; this run writes fresh ones.
        remove_checkpoint_dirs(ctx, self._checkpoint_architectures(ctx))

        log_info("\n🔀 Resetting git branch and removing tracked files...")
        self._git_reset(ctx)

        if ctx.keep_out:
            # Vendored third-party input, identical on every iteration: keeping
            # the downloaded SDK lets an iterate run add `--skip sparkle_setup`
            # and stay offline. The patch-created files in those dirs still go,
            # or `patches` cannot re-create them.
            log_info(
                "\n⏭️  --keep-out: keeping downloaded Sparkle/WinSparkle SDKs"
            )
            self._remove_patch_created_vendor_files(ctx)
        else:
            log_info("\n🧹 Cleaning Sparkle build artifacts...")
            self._clean_sparkle(ctx)

        log_info("\n🧹 Pruning orphaned resource binaries...")
        self._prune_orphan_binary_families(ctx)

    def _output_dirs(self, ctx: Context) -> tuple[Path, ...]:
        dirs: list[Path] = []
        seen: set[Path] = set()
        for architecture in self._output_architectures(ctx):
            out_ctx = Context(
                root_dir=ctx.root_dir,
                chromium_src=ctx.chromium_src,
                architecture=architecture,
                build_type=ctx.build_type,
                product=ctx.product,
            )
            out_path = out_ctx.chromium_src / out_ctx.out_dir
            if out_path in seen:
                continue
            dirs.append(out_path)
            seen.add(out_path)
        return tuple(dirs)

    def _output_architectures(self, ctx: Context) -> tuple[str, ...]:
        if "universal" in ctx.plan_architectures:
            return UNIVERSAL_INPUT_ARCHITECTURES
        return (ctx.architecture,)

    def _checkpoint_architectures(self, ctx: Context) -> tuple[str, ...]:
        if "universal" in ctx.plan_architectures:
            return (*UNIVERSAL_INPUT_ARCHITECTURES, "universal")
        return (ctx.architecture,)

    def _prune_orphan_binary_families(self, ctx: Context) -> None:
        """Remove resources/binaries/<family> dirs the download config no longer lists.

        Retired families linger on persistent runners with stale per-arch
        metadata (the retired browseros_claw_server dir failed a BrowserClaw
        universal merge, run 29882827339). Only immediate child directories
        are pruned; loose files and family contents are left alone.
        """
        binaries_dir = ctx.root_dir / "resources" / "binaries"
        if not binaries_dir.is_dir():
            return

        config_path = ctx.get_download_resources_config()
        families = managed_binary_families(config_path)
        if not families:
            # Fail safe: an empty set means the managed families are unknown
            # (missing/malformed config), never that everything is an orphan.
            log_warning(
                f"No managed resource families found in {config_path}; "
                "skipping orphan pruning"
            )
            return

        for entry in sorted(binaries_dir.iterdir()):
            if entry.is_dir() and entry.name not in families:
                safe_rmtree(entry)
                log_success(f"Removed orphaned resource family: {entry.name}")

    def _remove_patch_created_vendor_files(self, ctx: Context) -> None:
        """Delete the files our patch series CREATES inside the kept vendor dirs.

        `git clean` skips those dirs under --keep-out (see
        KEEP_OUT_CLEAN_EXCLUDES), which would otherwise leave last run's
        BUILD.gn / README.browseros in place and make the next `patches` step
        fail with "Failed to apply". Only new-file patches are removed: a patch
        that MODIFIES a downloaded SDK file needs that file to still be there.
        """
        patches_root = ctx.get_patches_dir()
        for vendor in KEEP_OUT_VENDOR_DIRS:
            patch_dir = patches_root / vendor
            if not patch_dir.is_dir():
                continue
            for patch_file in sorted(patch_dir.rglob("*")):
                if not patch_file.is_file() or not _patch_creates_file(patch_file):
                    continue
                relative = patch_file.relative_to(patches_root)
                target = ctx.chromium_src / relative
                if target.is_file():
                    target.unlink()
                    log_success(f"Removed patch-created file: {relative.as_posix()}")

    def _clean_sparkle(self, ctx: Context) -> None:
        sparkle_dir = ctx.get_sparkle_dir()
        if sparkle_dir.exists():
            safe_rmtree(sparkle_dir)
        winsparkle_dir = ctx.get_winsparkle_dir()
        if winsparkle_dir.exists():
            safe_rmtree(winsparkle_dir)
        log_success("Cleaned Sparkle/WinSparkle build directories")

    def _git_reset(self, ctx: Context) -> None:
        run_command(["git", "reset", "--hard", "HEAD"], cwd=ctx.chromium_src)

        # Reset all dirty submodules so gclient sync doesn't choke
        log_info("🧹 Resetting dirty submodules...")
        run_command(
            ["git", "submodule", "foreach", "--recursive",
             "git checkout -- . && git clean -fd"],
            cwd=ctx.chromium_src,
        )

        log_info("🧹 Running git clean with exclusions...")
        run_command(
            [
                "git",
                "clean",
                "-fdx",
                *CLEANED_DIRS,
                *(f"--exclude={pattern}" for pattern in self._clean_excludes(ctx)),
            ],
            cwd=ctx.chromium_src,
        )
        log_success("Git reset and clean complete")

    def _clean_excludes(self, ctx: Context) -> tuple[str, ...]:
        """Exclude patterns for `git clean`, in stable, de-duplicated order."""
        managed = gclient_managed_paths(ctx.chromium_src / "DEPS")
        if managed:
            log_info(
                f"Protecting {len(managed)} gclient-managed dependency "
                "paths from clean"
            )
        else:
            log_warning(
                "Falling back to the explicit exclude list; gclient-managed "
                "deps (CIPD/GCS) may be removed and need a `gclient sync`"
            )

        patterns: list[str] = []
        seen: set[str] = set()
        for pattern in (
            *FALLBACK_CLEAN_EXCLUDES,
            *(f"{path}/" for path in managed),
            *ALWAYS_CLEAN_EXCLUDES,
            *(KEEP_OUT_CLEAN_EXCLUDES if ctx.keep_out else ()),
        ):
            if pattern in seen:
                continue
            patterns.append(pattern)
            seen.add(pattern)
        return tuple(patterns)
