import { zodResolver } from '@hookform/resolvers/zod'
import { type FC, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod/v3'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { isNameTaken, normalizeSpaceName } from '@/lib/spaces/spaces.helpers'
import {
  SPACE_COLORS,
  type Space,
  type SpaceColor,
} from '@/lib/spaces/spaces.types'
import { cn } from '@/lib/utils'
import { SPACE_COLOR_HEX, SPACE_COLOR_LABEL } from './space-colors'

const spaceSchema = z.object({
  name: z.string().transform(normalizeSpaceName).pipe(z.string().min(1)),
  icon: z.string().trim().max(4),
  color: z.enum(SPACE_COLORS),
})

/**
 * @public
 */
export type SpaceDialogValues = z.infer<typeof spaceSchema>

export interface SpaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Existing space when editing; undefined when creating. */
  space?: Space
  /** All spaces, for duplicate-name validation. */
  spaces: Space[]
  defaultColor: SpaceColor
  onSubmit: (values: SpaceDialogValues) => Promise<void>
}

export const SpaceDialog: FC<SpaceDialogProps> = ({
  open,
  onOpenChange,
  space,
  spaces,
  defaultColor,
  onSubmit,
}) => {
  const form = useForm<SpaceDialogValues>({
    resolver: zodResolver(
      spaceSchema.refine(
        (values) => !isNameTaken(spaces, values.name, space?.id),
        { path: ['name'], message: 'A space with this name already exists.' },
      ),
    ),
    defaultValues: { name: '', icon: '', color: defaultColor },
  })

  useEffect(() => {
    if (!open) return
    form.reset({
      name: space?.name ?? '',
      icon: space?.icon ?? '',
      color: space?.color ?? defaultColor,
    })
  }, [open, space, defaultColor, form])

  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values)
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <Form {...form}>
          <form onSubmit={submit} className="space-y-5">
            <DialogHeader>
              <DialogTitle>{space ? 'Edit space' : 'New space'}</DialogTitle>
              <DialogDescription>
                A space is a named set of tabs. It shows up as a colored tab
                group in the sidebar.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-[4.5rem_1fr] gap-3">
              <FormField
                control={form.control}
                name="icon"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Icon</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="🧠"
                        maxLength={4}
                        className="text-center text-lg"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Work"
                        autoFocus
                        maxLength={40}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Color</FormLabel>
                  <div className="flex flex-wrap gap-2">
                    {SPACE_COLORS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        aria-label={SPACE_COLOR_LABEL[option]}
                        aria-pressed={field.value === option}
                        onClick={() => field.onChange(option)}
                        className={cn(
                          'size-7 rounded-full border-2 transition-transform hover:scale-110',
                          field.value === option
                            ? 'border-foreground'
                            : 'border-transparent',
                        )}
                        style={{ backgroundColor: SPACE_COLOR_HEX[option] }}
                      />
                    ))}
                  </div>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {space ? 'Save' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
