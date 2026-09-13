import { PERSONAL_BUILD } from '../personal/personal-build'

/**
 * Web host allowed to open the extension's app page. This product has no
 * marketing site, so it is empty and the manifest grants no web origin at all;
 * upstream builds keep their own host.
 * @public
 */
export const PRODUCT_WEB_HOST = PERSONAL_BUILD ? '' : 'browseros.com'
