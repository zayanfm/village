// Loads .env AND expands ${VAR} references so composed connection strings
// (DATABASE_URL / MONGO_URI / REDIS_URL) resolve from discrete credential vars.
// Plain `dotenv/config` does NOT expand, so import THIS first in every entry
// point — before anything that constructs a DB client.
import { config } from 'dotenv';
import { expand } from 'dotenv-expand';

expand(config());
