import { appAdminClient } from './app-admin.server';

let _admin: ReturnType<typeof appAdminClient> | undefined;

export const supabaseAdmin = new Proxy({} as ReturnType<typeof appAdminClient>, {
  get(_, prop, receiver) {
    if (!_admin) _admin = appAdminClient();
    return Reflect.get(_admin, prop, receiver);
  },
});
