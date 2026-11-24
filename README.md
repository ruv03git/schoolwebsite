# Fun N Learn Preschool - School Management System

A full-stack web application designed for **Fun N Learn Preschool**, located in Lohegaon, Pune. Features a public landing page, role-based authentication, an Admin Management Portal, and a dedicated Parent & Student Portal.

---

## School Information
- **School Name:** Fun N Learn Preschool
- **Campus Address:** Kalbhor Wasti, Lohegaon, Pune - 411 032, Maharashtra
- **Contact Email:** [admin@funnlearnpreschool.edu.in](mailto:admin@funnlearnpreschool.edu.in)
- **Phone Number:** +91 73292 83278
- **Programs Offered:**
  - **Playgroup:** Age 2 - 3 yrs
  - **Nursery:** Age 3 - 4 yrs
  - **LKG:** Age 3.5 / 4 - 5 yrs
  - **UKG:** Age 4.5 / 5 - 6 yrs

---

## Quick Start

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher; v22/v24 with native SQLite supported out of the box)

### 2. Configure environment
Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

- `JWT_SECRET` – a long random string used to sign login tokens (required).
- `DB_PATH` – absolute path to the SQLite file, **outside this repository**
  (e.g. `C:\school-data\school.db` or `/var/lib/school/school.db`).

### 3. Run the Application
In your terminal, navigate to the project directory:

```bash
cd c:\githubby\school-website
npm start
```

Then open your browser and visit:
**[http://localhost:3000](http://localhost:3000)**

> The database file and `.env` are git-ignored. Never commit them: they hold
> personal data and the token-signing secret. Back up the database separately.

---

## Account Access & Registration
- **Sign In:** Existing users and administrators can sign in using their username and password at `/login`.
- **Create New Account:** Parents and students can register by entering their email address, providing their name and role, and setting up their own username and password.

---

## Key Features

### 1. Public Website
- Modern responsive landing page showcasing programs: **Playgroup (2 - 3 yrs), Nursery (3 - 4 yrs), LKG (3.5/4 - 5 yrs), UKG (4.5/5 - 6 yrs)**
- School about section, learning philosophy, campus highlights, and upcoming preschool events
- Direct contact section with campus address in Kalbhor Wasti, phone number, and official email

### 2. Admin Portal (`/admin`)
- **Dashboard Overview:** Real-time metrics for total students, registered parents, today's attendance rate, and upcoming events
- **Student Management:**
  - Enroll new students individually
  - **Edit existing student details:** Modify name, program/class, section, roll number, birth date, contact info, and linked parent
  - **CSV Bulk Upload (Append):** Upload a `.csv` file to append batches of students to the existing list without overwriting existing records
  - **Download CSV Template:** One-click template download with pre-formatted column headers
  - Delete student records if needed
- **Parent Management:** Register parents, associate them with children, manage contact details
- **Milestone & Grade Tracking:** Enter activity assessments, marks, percentages, exam types, and teacher remarks
- **Daily Attendance:** Mark students as Present, Absent, Late, or Excused with date filters and visual badges
- **School Announcements:** Post targeted notices for everyone, parents only, or students with priority levels
- **Preschool Events:** Schedule sports days, science exhibitions, celebrations, and holidays

### 3. Parent & Student Portal (`/parent`)
- **Multi-Child Dashboard:** Switch seamlessly between enrolled children if a parent has multiple kids
- **Developmental Milestones & Grades:** View subject assessments (Phonics, Numbers, Arts & Crafts, Motor Skills) broken down by term
- **Attendance Records:** Graphical attendance breakdown (Present, Absent, Late) with full historical logs
- **Notice Board:** Stay up-to-date with school announcements and alerts
- **Profile & Security:** View enrolled profile info and change account passwords securely

---

## Tech Stack
- **Backend:** Node.js, Express.js
- **Database:** SQLite (`node:sqlite` DatabaseSync with WAL mode)
- **Security:** `bcryptjs` password hashing, JSON Web Tokens (`jsonwebtoken`)
- **Frontend:** HTML5, CSS3 (CSS Variables, Flexbox, CSS Grid), Responsive JavaScript SPA architecture
