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

## Table `companies`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `name` | `text` |  |
| `slug` | `text` |  Unique |
| `created_at` | `timestamptz` |  |

## Table `users`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `email` | `text` |  Nullable Unique |
| `password_hash` | `text` |  Nullable |
| `role_id` | `int4` |  |
| `created_at` | `timestamptz` |  |
| `company_id` | `int4` |  |

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
| `company_id` | `int4` |  |

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
| `name` | `text` |  |
| `price_cents` | `int4` |  |
| `active` | `bool` |  |
| `company_id` | `int4` |  |

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
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |
| `scheduled_date` | `date` |  Nullable |
| `referred_by` | `text` |  Nullable |
| `import_batch_id` | `int4` |  Nullable |
| `amount_cents` | `int4` |  Nullable |
| `tentative` | `bool` |  |
| `lead_id` | `int4` |  Nullable |
| `company_id` | `int4` |  |

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
| `company_id` | `int4` |  |

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
| `company_id` | `int4` |  |

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
| `company_id` | `int4` |  |

## Table `subdivisions`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `name` | `text` |  |
| `name_normalized` | `text` |  |
| `city` | `text` |  Nullable |
| `company_id` | `int4` |  |

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
| `company_id` | `int4` |  |

## Table `routes`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `route_day` | `date` |  |
| `created_by` | `int4` |  Nullable |
| `start_address` | `text` |  |
| `start_lat` | `float8` |  |
| `start_lng` | `float8` |  |
| `start_time` | `bpchar` |  |
| `service_minutes` | `int4` |  |
| `total_miles` | `numeric` |  |
| `travel_minutes` | `int4` |  |
| `created_at` | `timestamptz` |  |
| `company_id` | `int4` |  |

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
| `company_id` | `int4` | Primary |

## Table `messenger_batches`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `created_by` | `int4` |  Nullable |
| `token_hash` | `bpchar` |  Unique |
| `message_template` | `text` |  |
| `link_days` | `int4` |  |
| `fetch_expires_at` | `timestamptz` |  |
| `results_expires_at` | `timestamptz` |  |
| `fetched_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  |
| `company_id` | `int4` |  |

## Table `messenger_batch_recipients`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `batch_id` | `int4` |  |
| `customer_id` | `int4` |  |
| `status` | `text` |  |
| `access_link_id` | `int4` |  Nullable |
| `sent_at` | `timestamptz` |  Nullable |
| `error` | `text` |  Nullable |

## Table `leads`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `name` | `text` |  |
| `name_normalized` | `text` |  |
| `phone` | `text` |  |
| `phone_normalized` | `text` |  |
| `address` | `text` |  |
| `address_normalized` | `text` |  |
| `customer_id` | `int4` |  Nullable |
| `created_at` | `timestamptz` |  |
| `company_id` | `int4` |  |

## Table `audit_log`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `company_id` | `int4` |  |
| `actor_id` | `int4` |  Nullable |
| `action` | `text` |  |
| `target_id` | `int4` |  Nullable |
| `details` | `jsonb` |  |
| `created_at` | `timestamptz` |  |
