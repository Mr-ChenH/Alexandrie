import type { Node, PublicUser, User } from '~/stores';
import { resolveApiBase } from '~/helpers/api-base';

export function useApi() {
  const config = useRuntimeConfig();
  const CDN = config.public.baseCdn;
  const API = resolveApiBase(config.public.baseApi, config.baseApiInternal, import.meta.server);
  const cdnEndpoint = config.public.cdnEndpoint || '';

  function avatarURL(user?: User | PublicUser | null): string {
    if (!user?.avatar) return '/placeholder/avatar.avif';
    if (user.avatar.startsWith('http://') || user.avatar.startsWith('https://')) {
      return user.avatar;
    }
    return CDN + cdnEndpoint + user.id + `/avatar?v=${user.avatar}`;
  }

  function resourceURL(resource?: Node, download = false): string {
    if (!resource) return '';
    return `${CDN}${cdnEndpoint}${resource.user_id}/${resource.metadata?.transformed_path || resource.content}${
      download ? '?response-content-disposition=attachment' : ''
    }`;
  }

  return { CDN, API, avatarURL, resourceURL };
}
