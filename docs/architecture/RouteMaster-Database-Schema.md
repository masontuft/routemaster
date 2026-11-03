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

## Table `properties`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `customer_id` | `int4` |  |
| `street` | `text` |  |
| `city` | `text` |  |
| `zip` | `text` |  Nullable |
| `address_normalized` | `text` |  |
| `notes` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |

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

