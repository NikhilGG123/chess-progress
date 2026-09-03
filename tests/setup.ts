import { config } from "dotenv";

// Tests read the same .env.local the app does, so there is one place to keep
// credentials. Nothing here is committed.
config({ path: ".env.local", quiet: true });
