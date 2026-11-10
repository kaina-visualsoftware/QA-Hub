import {createPublicAttachmentHandler} from "./handler.mjs";
Deno.serve(createPublicAttachmentHandler({
 base:Deno.env.get("SUPABASE_URL"),key:Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
}));
