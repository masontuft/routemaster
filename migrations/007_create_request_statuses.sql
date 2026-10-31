CREATE TABLE request_statuses (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL
);

INSERT INTO request_statuses (name, sort_order) VALUES
    ('Needs Review', 1),
    ('Requested', 2),
    ('Scheduled', 3),
    ('Completed', 4),
    ('Cancelled', 5);
