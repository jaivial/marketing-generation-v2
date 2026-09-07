# Access Control List (ACL)

MarketingForge implements a single, end-to-end **role-based access control
(RBAC)** system that is enforced *both* on the backend (FastAPI) and the
frontend (React Router).

The single source of truth is `app/core/acl.py` (Python) and its mirror
`frontend/src/lib/acl.ts` (TypeScript). Both files share the same role
names, the same bit values, and the same permission identifiers; any
divergence would manifest as a test failure.

---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

---

## User Role Flags

Roles are stored on the user record as a **single integer bitmask**.
Each role is a power-of-two bit so a user can hold multiple roles
simultaneously (e.g. USER + BILLING = 10).

| Flag      | Bit | Name      | Summary                                                     |
| ---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

--- | ---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

--- | ---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

--- | ---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

----- |
| `GUEST`   | 1   | `guest`   | Unauthenticated visitor. Landing + pricing only.            |
| `USER`    | 2   | `user`    | Standard authenticated user. Own campaigns and library.     |
| `VIEWER`  | 4   | `viewer`  | Read-only access to own data. Useful for client sharing.    |
| `BILLING` | 8   | `billing` | Manage tenant billing + view integrations (typically ORed with USER). |
| `ADMIN`   | 16  | `admin`   | Tenant administrator. All data within the tenant.            |
| `ROOT`    | 32  | `root`    | Global super-administrator. Full system access.             |

`ROOT` is special: it implicitly grants *every* permission. There is no
need to OR it with another flag for the holder to be considered an admin.

---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

---

## Permissions

Permissions are string identifiers grouped by category. A role's
permission set is the union of all flags in its bitmask. The full list
is exported by the backend and used by the frontend's matrix viewer.

### Pages (`page:*`)

| Permission               | Routes (frontend)            | Backend equivalent  |
| ---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

--- | ---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

---- | ---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

---- |
| `page:landing`           | `/`                          | n/a (public)        |
| `page:pricing`           | `/pricing`                   | n/a (public)        |
| `page:dashboard`         | `/dashboard`                 | n/a                 |
| `page:campaigns.own`     | `/campaigns`, `/campaigns/:id` | `/api/campaigns/history` |
| `page:campaigns.all`     | (admin view)                 | reserved            |
| `page:library`           | `/library`                   | n/a                 |
| `page:integrations`      | `/integrations`              | n/a                 |
| `page:analytics.own`     | `/analytics`                 | n/a                 |
| `page:analytics.all`     | (admin view)                 | reserved            |
| `page:billing`           | (admin view)                 | reserved            |
| `page:settings.own`      | `/settings`                  | n/a                 |

### Campaign mutations (`campaign:*`)

| Permission             | Effect                                  |
| ---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

---- | ---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

--- |
| `campaign:create`      | May run a campaign (`POST /api/campaigns`) |
| `campaign:delete.own`  | May delete their own campaign           |
| `campaign:delete.any`  | May delete any campaign in the tenant   |

### System admin (`admin:*`)

| Permission         | Routes (frontend)      | Backend equivalent            |
| ---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

--- | ---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

---- | ---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

----- |
| `admin:users`      | `/admin/users`         | `/api/admin/users`, `/api/admin/users/{id}` |
| `admin:system`     | `/admin/system`, `/admin/acl` | `/api/admin/system`, `/api/admin/roles`, `/api/admin/permissions`, `/api/admin/routes`, `/api/admin/acl/matrix` |
| `admin:logs`       | `/admin/logs`          | `/api/admin/logs`, `/api/admin/logs/test` |
| `admin:campaigns.all` | reserved for /admin/campaigns | reserved                  |

### Data plane (`data:*`)

| Permission     | Effect                                     |
| ---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

----- | ---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

--- |
| `data:users`   | May read/modify any user (root only).      |
| `data:billing` | May read/modify billing data.              |
| `data:logs`    | May read the system log ring buffer.       |

---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

---

## Role × Permission Matrix

| Permission             | GUEST | USER | VIEWER | BILLING | ADMIN | ROOT |
| ---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

---- | :---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

---: | :--: | :---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

----: | :---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

-----: | :---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

---: | :--: |
| `page:landing`         |   ✓   |  ✓   |   ✓    |    ✓    |   ✓   |  ✓   |
| `page:pricing`         |   ✓   |  ✓   |   ✓    |    ✓    |   ✓   |  ✓   |
| `page:dashboard`       |       |  ✓   |   ✓    |    ✓    |   ✓   |  ✓   |
| `page:campaigns.own`   |       |  ✓   |   ✓    |         |   ✓   |  ✓   |
| `page:campaigns.all`   |       |      |        |         |   ✓   |  ✓   |
| `page:library`         |       |  ✓   |   ✓    |         |   ✓   |  ✓   |
| `page:integrations`    |       |  ✓   |   ✓    |    ✓    |   ✓   |  ✓   |
| `page:analytics.own`   |       |  ✓   |   ✓    |         |   ✓   |  ✓   |
| `page:analytics.all`   |       |      |        |         |   ✓   |  ✓   |
| `page:billing`         |       |      |        |    ✓    |   ✓   |  ✓   |
| `page:settings.own`    |       |  ✓   |   ✓    |    ✓    |   ✓   |  ✓   |
| `campaign:create`      |       |  ✓   |        |         |   ✓   |  ✓   |
| `campaign:delete.own`  |       |  ✓   |        |         |   ✓   |  ✓   |
| `campaign:delete.any`  |       |      |        |         |   ✓   |  ✓   |
| `admin:users`          |       |      |        |         |       |  ✓   |
| `admin:system`         |       |      |        |         |       |  ✓   |
| `admin:logs`           |       |      |        |         |       |  ✓   |
| `admin:campaigns.all`  |       |      |        |         |   ✓   |  ✓   |
| `data:logs`            |       |      |        |         |       |  ✓   |
| `data:users`           |       |      |        |         |   ✓   |  ✓   |
| `data:billing`         |       |      |        |    ✓    |   ✓   |  ✓   |

(Empty cells are 403.)

---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

---

## Route Access (HTTP)

The table below summarises what each HTTP route requires. The "Anon"
column is the response for an unauthenticated request; the other columns
show the response when a request carries a token whose role bitmask is
exactly that role.

| Method | Path                              | Permission         | Anon | USER | VIEWER | BILLING | ADMIN | ROOT |
| ---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

--- | ---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

--- | ---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

------

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

--- | :--: | :--: | :---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

----: | :---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

-----: | :---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

---: | :--: |
| GET    | `/api/health`                     | (public)           |  200 |  200 |  200   |   200   |  200  |  200 |
| GET    | `/api/auth/whoami`                | (public)           |  200 |  200 |  200   |   200   |  200  |  200 |
| GET    | `/api/campaigns/history`          | `page:campaigns.own` | 403 | 200 |  200   |   403   |  200  |  200 |
| POST   | `/api/campaigns`                  | `campaign:create`  | 403 | 200 |  403   |   403   |  200  |  200 |
| POST   | `/api/campaigns/sync`             | `campaign:create`  | 403 | 200 |  403   |   403   |  200  |  200 |
| GET    | `/api/admin/roles`                | `admin:system`     | 403 | 403 |  403   |   403   |  403  |  200 |
| GET    | `/api/admin/permissions`          | `admin:system`     | 403 | 403 |  403   |   403   |  403  |  200 |
| GET    | `/api/admin/routes`               | `admin:system`     | 403 | 403 |  403   |   403   |  403  |  200 |
| GET    | `/api/admin/acl/matrix`           | `admin:system`     | 403 | 403 |  403   |   403   |  403  |  200 |
| GET    | `/api/admin/users`                | `admin:users`      | 403 | 403 |  403   |   403   |  403  |  200 |
| GET    | `/api/admin/users/{id}`           | `admin:users`      | 403 | 403 |  403   |   403   |  403  |  200 |
| POST   | `/api/admin/users`                | `data:users`       | 403 | 403 |  403   |   403   |  403  |  200 |
| PUT    | `/api/admin/users/{id}`           | `data:users`       | 403 | 403 |  403   |   403   |  403  |  200 |
| DELETE | `/api/admin/users/{id}`           | `data:users`       | 403 | 403 |  403   |   403   |  403  |  200 |
| GET    | `/api/admin/system`               | `admin:system`     | 403 | 403 |  403   |   403   |  403  |  200 |
| GET    | `/api/admin/logs`                 | `data:logs`        | 403 | 403 |  403   |   403   |  403  |  200 |
| POST   | `/api/admin/logs/test`            | `data:logs`        | 403 | 403 |  403   |   403   |  403  |  200 |

---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

---

## Global middleware

### Backend (`app/main.py`)

```python
class ACLMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if not request.url.path.startswith("/api/"):
            return await call_next(request)        # SPA shell, static
        principal = _resolve_principal(request)    # headers → Principal
        request.state.principal = principal
        enforce_route_acl(request.method, request.url.path, principal)
        return await call_next(request)
```

Every API request flows through this middleware before any route handler.
If the principal lacks the required permission the middleware short-circuits
with `403 Forbidden` and a JSON body describing what was missing.

### Frontend (`frontend/src/lib/guard.tsx`)

```tsx
<RequirePermission permission="admin:system">
  <AdminSystem />
</RequirePermission>
```

`RequirePermission` wraps every protected route in `App.tsx` and either
renders the page, redirects to `/login` (anonymous), or shows the
`AccessDenied` screen (authenticated but unauthorised). The same
permission strings are used as on the backend so there's a single mental
model.

---

**Note**: BILLING does not include `page:campaigns.own`, so a user with *only* the BILLING flag won't see their campaigns. In practice the BILLING flag is ORed with USER (giving 2+8 = 10), so billing users retain access to their own data while also gaining billing management.

---

## Demo token format

For development / tests the SPA sends a bearer token in the form:

```
Authorization: Bearer demo:<role-bitmask>:<user-id>[:<email>]
```

Example: a user with USER + BILLING (bits 2 + 8 = 10) would send
`Bearer demo:10:u-001:alice@example.com`.

The backend parses this in `_parse_demo_token` and constructs the
`Principal`. A real production deployment would replace this with a
signed JWT or session cookie; the rest of the ACL machinery doesn't
care how the principal was obtained.
