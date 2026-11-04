RouteMaster Database Schema

## Table `schema_migrations`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `name` | `text` | Primary |
| `applied_at` | `timestamptz` |  |

## Table `roles`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `name` | `text` |  Unique |

## Table `users`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `email` | `text` |  Nullable Unique |
| `password_hash` | `text` |  Nullable |
| `role_id` | `int4` |  |
| `created_at` | `timestamptz` |  |

## Table `session`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `sid` | `varchar` | Primary |
| `sess` | `json` |  |
| `expire` | `timestamp` |  |

## Table `customers`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `user_id` | `int4` |  Nullable Unique |
| `name` | `text` |  |
| `name_normalized` | `text` |  |
| `phone` | `text` |  Nullable |
| `phone_normalized` | `text` |  Nullable |
| `email` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `import_batch_id` | `int4` |  Nullable |

## Table `properties`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `customer_id` | `int4` |  |
| `street` | `text` |  |
| `city` | `text` |  Nullable |
| `zip` | `text` |  Nullable |
| `address_normalized` | `text` |  |
| `notes` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `subdivision_id` | `int4` |  Nullable |
| `import_batch_id` | `int4` |  Nullable |
| `latitude` | `float8` |  Nullable |
| `longitude` | `float8` |  Nullable |
| `geocode_status` | `text` |  |
| `geocoded_at` | `timestamptz` |  Nullable |

## Table `service_types`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `name` | `text` |  Unique |
| `price_cents` | `int4` |  |
| `active` | `bool` |  |

## Table `request_statuses`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `name` | `text` |  Unique |
| `sort_order` | `int4` |  |

## Table `service_requests`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `customer_id` | `int4` |  Nullable |
| `property_id` | `int4` |  Nullable |
| `service_type_id` | `int4` |  |
| `status_id` | `int4` |  |
| `preferred_date` | `date` |  |
| `notes` | `text` |  Nullable |
| `contact_name` | `text` |  Nullable |
| `contact_phone` | `text` |  Nullable |
| `contact_address` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |
| `scheduled_date` | `date` |  Nullable |
| `referred_by` | `text` |  Nullable |
| `import_batch_id` | `int4` |  Nullable |
| `amount_cents` | `int4` |  Nullable |
| `tentative` | `bool` |  |

## Table `status_history`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `service_request_id` | `int4` |  |
| `status_id` | `int4` |  |
| `changed_by` | `int4` |  Nullable |
| `note` | `text` |  Nullable |
| `changed_at` | `timestamptz` |  |

## Table `access_links`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `customer_id` | `int4` |  |
| `token_hash` | `bpchar` |  Unique |
| `expires_at` | `timestamptz` |  |
| `revoked_at` | `timestamptz` |  Nullable |
| `created_by` | `int4` |  Nullable |
| `created_at` | `timestamptz` |  |
| `link_batch_id` | `int4` |  Nullable |

## Table `reviews`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `service_request_id` | `int4` |  Unique |
| `customer_id` | `int4` |  |
| `rating` | `int4` |  |
| `body` | `text` |  |
| `hidden` | `bool` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `contact_messages`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `name` | `text` |  |
| `email` | `text` |  |
| `phone` | `text` |  Nullable |
| `message` | `text` |  |
| `status` | `text` |  |
| `reply_note` | `text` |  Nullable |
| `replied_by` | `int4` |  Nullable |
| `replied_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `import_batches`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `created_by` | `int4` |  Nullable |
| `sheet_id` | `text` |  |
| `sheet_name` | `text` |  |
| `season_year` | `int4` |  |
| `plan_hash` | `bpchar` |  |
| `customers_created` | `int4` |  |
| `properties_created` | `int4` |  |
| `jobs_created` | `int4` |  |
| `jobs_existing` | `int4` |  |
| `rows_skipped` | `int4` |  |
| `created_at` | `timestamptz` |  |

## Table `import_mappings`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `sheet_id` | `text` |  |
| `sheet_name` | `text` |  |
| `header_row` | `int4` |  |
| `columns` | `jsonb` |  |
| `options` | `jsonb` |  |
| `updated_at` | `timestamptz` |  |

## Table `subdivisions`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `name` | `text` |  |
| `name_normalized` | `text` |  Unique |
| `city` | `text` |  Nullable |

## Table `area_days`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `subdivision_id` | `int4` |  |
| `day` | `date` |  |

## Table `link_batches`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `subdivision_id` | `int4` |  Nullable |
| `created_by` | `int4` |  Nullable |
| `days` | `int4` |  |
| `links_created` | `int4` |  |
| `skipped_no_phone` | `int4` |  |
| `skipped_active` | `int4` |  |
| `created_at` | `timestamptz` |  |

## Table `routes`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `route_day` | `date` |  Unique |
| `created_by` | `int4` |  Nullable |
| `start_address` | `text` |  |
| `start_lat` | `float8` |  |
| `start_lng` | `float8` |  |
| `start_time` | `bpchar` |  |
| `service_minutes` | `int4` |  |
| `total_miles` | `numeric` |  |
| `travel_minutes` | `int4` |  |
| `created_at` | `timestamptz` |  |

## Table `route_stops`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `route_id` | `int4` |  |
| `position` | `int4` |  |
| `service_request_id` | `int4` |  |
| `leg_miles` | `numeric` |  |
| `leg_minutes` | `int4` |  |
| `arrive_minutes` | `int4` |  |
| `depart_minutes` | `int4` |  |

## Table `app_settings`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `key` | `text` | Primary |
| `value` | `text` |  |
| `updated_by` | `int4` |  Nullable |
| `updated_at` | `timestamptz` |  |
