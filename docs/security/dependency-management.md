# Dependency Management

Mason approves each new dependency first. Install with pnpm and commit the lockfile; CI will use a frozen install. Candidates, none installed: express, ejs, pg, express-session, connect-pg-simple, bcrypt, multer, an `.xlsx` parser, supertest, eslint, playwright. A dependency audit command is not wired yet.
