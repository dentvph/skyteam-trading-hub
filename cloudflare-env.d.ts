declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    CRM_OWNER_EMAIL?: string;
    LEAD_FORM_SECRET?: string;
  }
}
