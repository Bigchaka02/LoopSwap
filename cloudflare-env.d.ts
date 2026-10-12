declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    LOOPSWAP_MODE?: 'demo' | 'pilot';
    LOOPSWAP_JOB_SECRET?: string;
  }
}
