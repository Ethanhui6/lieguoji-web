// Cloudflare Pages Function entry for /api/cloud/*; the logic lives in src/server/cloud47.ts.
import {handleCloud47,type CloudEnv47} from '../../../src/server/cloud47';
export const onRequest=(context:{request:Request;env:CloudEnv47})=>handleCloud47(context.request,context.env);
