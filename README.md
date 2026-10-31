# FAIZAN AHMED CHATS

A mobile-responsive, glassmorphism real-time chat starter built with Next.js and Supabase. The supplied FA branding is included as the app logo and favicon.

## Included
- Email/password signup and login through Supabase Auth
- Unique usernames and user directory
- Private one-to-one conversations and live message updates
- Image, audio/voice recording, and file attachments
- Admin dashboard for user-role management
- Responsive mobile layout, SEO metadata and sitemap

## 1. Create and configure Supabase
1. Create a Supabase project.
2. Open **SQL Editor** and run the complete `supabase/schema.sql` file.
3. In **Project Settings → API**, copy the Project URL and publishable (or anon) key.
4. In Supabase **Authentication → URL Configuration**, set your site URL to your Vercel URL and add preview URLs if needed.
5. For quick testing, email confirmation can remain enabled; users will need to verify email before signing in.

## 2. Run locally
```bash
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev
```
Open http://localhost:3000.

## 3. Deploy to Vercel
1. Push this folder to a GitHub repository.
2. In Vercel choose **Add New → Project** and import the repository.
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy. Framework should be detected as Next.js; build command `npm run build`.

## 4. Make the first admin
1. Create your own account through the website.
2. In Supabase SQL Editor run this command, replacing the email with your own account email:
```sql
update public.profiles set role='admin' where email='YOUR-ADMIN-EMAIL';
```
Do not put the admin password in source code or SQL. Use a unique password in Supabase Auth and enable MFA for the admin account where possible.

## Privacy and security notes
- The app tells users that messages and media are stored and that admin moderation access exists.
- Admin dashboard currently manages user roles; it does not silently expose every private conversation.
- IP logging and geolocation are intentionally not included. If added, disclose it clearly, collect only what is needed, restrict access and set a retention period.
- The sample media bucket is public so message attachments can render without signed URL plumbing. Anyone with a media URL may view that file. For private production media, switch to a private bucket and use signed URLs.
- This starter is not end-to-end encrypted. Do not market it as E2EE.
- Apply Supabase security advisor recommendations before production use.
