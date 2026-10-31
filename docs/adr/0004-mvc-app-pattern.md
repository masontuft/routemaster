# ADR 0004: App Pattern

## Status

Accepted

## Date

2026-10-30

## Context

The standing rule is that Express backends follow strict MVC with separate `models/`, `controllers/` and `views/` folders. The course requires a clear separation of models, views and controllers, middleware for authentication, validation and errors, and one global error handler.

## Decision drivers

- Course requirement 4 (MVC architecture and code organization).
- Mason's standing rule.

## Decision

Strict MVC, with two extra folders:

    models/        SQL queries, one file per table or concept
    controllers/   request handling; calls models; renders views
    views/         EJS templates, layouts and partials
    routes/        thin: URL and role check mapped to a controller function
    middleware/    authentication, validation, global error handler

Error handling: controllers do not wrap handlers in `try/catch`, because Express 5 forwards rejected promises to the error handler. Model files may use `try/catch` where a consistent return value is wanted.

## Alternatives considered

- No `routes/` folder, with routes defined inside controllers. Fewer files, but each controller then mixes URL wiring with logic. The course allows it.

## Consequences

- MDN's Express tutorial uses a separate routes layer between URLs and controllers. Its page never uses the term "MVC" in body text, so this layout is MDN's, not an official Express rule.
- Nothing is built yet: Not currently implemented.

## References

- MDN MVC glossary: https://developer.mozilla.org/en-US/docs/Glossary/MVC
- MDN Express routes and controllers: https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Server-side/Express_Nodejs/routes
- Express 5 migration guide: https://expressjs.com/en/guide/migrating-5.html
