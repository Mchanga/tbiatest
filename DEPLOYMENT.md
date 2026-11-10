# Deploy TBIA on Render

The Render Blueprint in `render.yaml` creates the API and frontend services. It
does not create, replace, or seed a database.

## Before deploying

1. Make sure the existing production PostgreSQL database is reachable from
   Render. The database currently configured on the development machine uses
   `localhost`, which is not reachable by a deployed service.
2. In Render, set the API's `DB_HOST`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`
   to the existing production database values. Set `DB_SSL=true` if the
   database provider requires TLS.
3. Enter the SMTP settings when prompted. These are required by the production
   configuration for account verification and password reset emails.
4. If the production frontend uses a different domain, update `FRONTEND_URL`,
   `CORS_ORIGIN`, and the frontend's `VITE_API_URL` in `render.yaml` before
   deploying.

Never commit production credentials or paste them into source files.

## Database schema and migrations

The checked-in SQL files contain five incremental migrations, not the complete
initial schema. Do not point the deployment at an empty database. Back up the
existing production database, verify it already has the application's base
tables, and run `npm run db:migrate` from the backend service shell. The
migration runner checks applied migration checksums and applies only missing
migrations.

The app's `/api/v1/health/ready` endpoint checks the database connection. A
successful deployment must report `ready` there; a frontend build alone does
not verify database connectivity or email delivery.

## Render services

- API: `https://tbiatest-api.onrender.com`
- Frontend: `https://tbiatest.onrender.com`
- API health: `https://tbiatest-api.onrender.com/api/v1/health/ready`

Both services use Render's free plan in the Blueprint. The API can spin down
when idle, so its first request may take longer to respond.
