# SAOConnect

SAOConnect is a student-facing Student Affairs Office portal built with React, Vite, TypeScript, Tailwind CSS, Framer Motion, and Supabase. The interface can be previewed without credentials; authentication and live records become available after connecting a Supabase project.

## Architecture

- **Web client:** React + Vite + TypeScript. Supabase's publishable key is the only key used in the browser.
- **Identity:** Supabase Auth with email/password, email verification, sign-in/out, and password reset email.
- **Data:** Supabase PostgreSQL with UUID relationships, constraints, indexes, triggers, and RLS on all public application tables.
- **Files:** A private `request-attachments` Storage bucket limited to PDF, JPEG, and PNG files up to 10 MiB. Storage path access rules are included.
- **Authorization:** A trusted `user_roles` table; public registration always creates a student role. Elevated role assignment is a project-owner action.
- **Realtime:** Request status changes create private in-app notifications. The notification center also subscribes to the signed-in student's notification inserts; enable `public.notifications` in the Supabase Realtime publication for live delivery.

## Database relationships

```text
auth.users 1—1 profiles 1—many user_roles
profiles 1—many service_requests many—1 service_categories
service_requests 1—many request_status_history
service_requests 1—many request_attachments
profiles (staff) 1—many staff_availability
profiles (student) 1—many appointments; appointments may reference staff profiles
events 1—many event_registrations many—1 profiles
profiles 1—many notifications
profiles 1—many feedback; feedback references one completed request OR appointment
profiles (author) 1—many announcements
profiles (actor) 1—many audit_logs
```

Private request attachments are stored in a private bucket. Their metadata refers to the request, uploader, and storage path. Status-history rows preserve the student-visible transition message; internal notes are excluded from the student Data API column grant.

## Local setup

1. Install Node.js 22 or newer and npm.
2. Create a Supabase project. In **Project Settings → API**, copy the project URL and publishable key (sometimes labeled `anon` on older projects).
3. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never add a service-role or secret key to a `VITE_` variable.
4. Apply every SQL file in `supabase/migrations/` in timestamp order using the Supabase CLI after linking the project, or paste each file into the Supabase SQL Editor as the project owner.
5. In Supabase Auth settings, enable email confirmations and set the site URL and redirect URLs for local development and deployment.
6. Install dependencies and run the client:

   ```sh
   npm install
   npm run dev
   ```

7. Create a student account using `/register`. Confirm the verification email before signing in. Development email delivery may use Supabase's built-in mail service; configure a custom SMTP provider for reliable university use.

## First administrator

Create and verify the trusted staff account through Supabase Auth. Then, as the project owner in the SQL Editor, look up that account's UUID in `auth.users` and run:

```sql
insert into public.user_roles (user_id, role)
values ('<trusted-user-uuid>', 'admin')
on conflict do nothing;
```

Replace the placeholder with the verified account UUID. Never expose this SQL operation, the service-role key, or role mutations to public registration. `user_roles` has no client insert/update/delete grants. The optional `super_admin` role follows the same owner-only bootstrap process.

## Security notes

- RLS is enabled for every application table in `public`; policies scope student-owned requests, appointments, registrations, notifications, feedback, and attachments.
- Staff can review unassigned requests and claim them; staff can update requests assigned to them. Administrators can review all requests and assign them to staff. These actions are guarded by database RLS policies. Role checks use the database role table, not user-editable metadata.
- The appointment table has a PostgreSQL exclusion constraint that rejects overlapping active appointments for the same staff member.
- Event registration locks the event row while checking capacity to prevent overbooking.
- Supabase Storage is private. Students can access their own UID folder; staff can read files only for assigned requests and administrators can read authorized service records. Signed URL generation is not yet wired into the interface.
- Service-role credentials must remain in a trusted server environment. No privileged browser-side function is included.
- Run the Supabase Security Advisor after applying the migration and review all results in the actual project configuration.

## Implemented

- Responsive public landing page with service overview, clearly labeled preview announcements, how-it-works, FAQs, and contact guidance.
- Supabase Auth registration, sign-in, sign-out, verification email, password-reset email, session-aware routes, and role-aware workspace navigation.
- Student workspace with request list/create, request reference and status display, category guidance, event browsing/registration, appointment slot selection, profile editing, announcement viewing, and notifications.
- Staff/admin workspace shells with assigned request visibility, published announcements, and role-gated navigation.
- Announcement publishing for authorized staff/admin users.
- RLS-protected normalized schema, starter service categories, request status history trigger, appointment overlap constraint, event capacity guard, and private Storage bucket rules.
- Reduced-motion support, keyboard-accessible form labels and controls, responsive layouts, loading/empty/error states, and toast feedback.

## Known limitations

This is a functional foundation, not a complete university deployment. No Supabase project credentials were provided, so the database migration could not be applied to a live project and live authentication/data could not be exercised here.

- Staff/admin record-management workflows are not all present yet. Role management, appointment scheduling/availability management, event editing/cancellation, feedback reporting, audit-log generation, CSV export, and system settings still need UI and trusted server-side implementation.
- Student request attachments are represented in the schema and private bucket but upload, metadata validation on a trusted boundary, and signed-URL retrieval are not wired into the form.
- Appointment booking reads availability and writes a request; the database overlap constraint is in place, but actual Supabase migration execution is required before it can provide enforcement.
- Request status notifications and the student notification center are connected. Appointment reminders, announcement notifications, event messages, and email/push delivery still need separate triggers or delivery providers.
- Announcement/event image upload, public detail routes, knowledge-base editing, analytics charts, automated email/push reminders, and audit event capture are not implemented.
- Password reset email and recovery screen are implemented; configure Supabase redirect URLs to allow `/reset-password` in each environment.
- Form validation tests and a database RLS access test script are included. RLS tests require a local Supabase stack and have not run because the Supabase CLI/project is not configured in this workspace.

## Build

```sh
npm run typecheck
npm test
npm run build
```

To run the database access tests, install the Supabase CLI, run `supabase init`, start a local Supabase stack, apply the migration, then run `supabase test db`. The included RLS test verifies that two student identities cannot read each other's requests or elevate their own roles, and that a student cannot mark a request completed.

Configure the production host with the same two Vite variables, set the Supabase Auth site/redirect URLs, apply the migration, and use SPA fallback routing so nested routes return `index.html`.
