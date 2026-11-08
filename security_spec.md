# Security Specification — EduAssess CBT Firestore Rules

## 1. Data Invariants
1. **Default-Deny Catch-All**: Any path not explicitly matched in `firestore.rules` is strictly denied (`allow read, write: if false;`).
2. **Path Variable Hardening (`isValidId`)**: Every single-document operation (`get`, `create`, `update`, `delete`) validates that the document ID matches `^[a-zA-Z0-9_\-]+$` and is `<= 128` characters.
3. **Strict Schema & Key Validation**: Every write (`create` and `update`) invokes its entity validation helper (`isValidExam`, `isValidStudent`, `isValidQuestion`, `isValidResult`, `isValidCbtSyncPulse`, `isValidAdminProfile`) which enforces exact required keys (`hasAll`), exact allowed keys (`hasOnly`), type safety, and string `.size()` bounds.
4. **Bootstrapped Verified Admin**: Admin privileges (`isAdmin()`) require a verified email (`request.auth.token.email_verified == true`) matching the teacher account `sahidin30@gmail.com` or an existing document in `/admins/$(request.auth.uid)`.
5. **Query Enforcer on List Operations**: Every `allow list` rule restricts access to `isAdmin() || (isSignedIn() && resource.data.authorUid == request.auth.uid)`, preventing unauthorized blanket scraping.
6. **Immutable Ownership**: During `update`, `incoming().authorUid == existing().authorUid` and `incoming().id == existing().id` are strictly enforced.

## 2. The "Dirty Dozen" Payloads (Adversarial Test Vectors)
1. **Shadow Field Injection on Exam (`isVerified: true`)**:
   `{ "id": 1, "judul_ujian": "Matematika X", "durasi_menit": 60, "target_tingkat": "10", "target_kelas": "SEMUA", "authorUid": "uid1", "updatedAt": "2026-11-08T00:00:00Z", "isVerified": true }` -> Rejected by `hasOnly`.
2. **Oversized String Attack on Exam Title (>200 chars)**:
   `{ "id": 1, "judul_ujian": "A".repeat(500), "durasi_menit": 60, "target_tingkat": "10", "target_kelas": "SEMUA", "authorUid": "uid1", "updatedAt": "2026-11-08T00:00:00Z" }` -> Rejected by `.size() <= 200`.
3. **Invalid Grade Enum on Exam (`target_tingkat: "13"`)**:
   `{ "id": 1, "judul_ujian": "Matematika", "durasi_menit": 60, "target_tingkat": "13", "target_kelas": "SEMUA", "authorUid": "uid1", "updatedAt": "2026-11-08T00:00:00Z" }` -> Rejected by enum check.
4. **Invalid Token Format on Student (`token_ujian: "abc"`)**:
   `{ "id": 1, "nama": "Budi", "kelas": "X MIPA 1", "token_ujian": "abc", "status_ujian": "Belum Mulai", "authorUid": "uid1", "updatedAt": "2026-11-08T00:00:00Z" }` -> Rejected by `matches('^[A-Z0-9]{6}$')`.
5. **Invalid Student Status Transition (`status_ujian: "Hacked"`)**:
   `{ "id": 1, "nama": "Budi", "kelas": "X MIPA 1", "token_ujian": "AB12CD", "status_ujian": "Hacked", "authorUid": "uid1", "updatedAt": "2026-11-08T00:00:00Z" }` -> Rejected by status enum check.
6. **Unverified Admin Email Spoof (`email: "sahidin30@gmail.com"`, `email_verified: false`)**:
   Attempt to write to `/exams/1` with unverified token -> Rejected by `request.auth.token.email_verified == true`.
7. **Owner Spoofing on Create (`authorUid != request.auth.uid`)**:
   Authenticated user `uid_attacker` writes `authorUid: "uid_victim"` -> Rejected by `data.authorUid == request.auth.uid`.
8. **Immutable ID Mutation on Update (`incoming().id != existing().id`)**:
   Updating `/students/1` to change `id` from `1` to `999` -> Rejected by immutability check.
9. **Path Poisoning with Invalid Document ID (`/exams/invalid$id!`)**:
   Writing to document ID containing `$` or exceeding 128 chars -> Rejected by `isValidId()`.
10. **Negative or Out-of-Bounds Exam Score (`skor_angka: 999`)**:
    `{ "id": 1, "student_id": 1, "exam_id": 1, "skor_angka": 999, "pelanggaran_tab": 0, "authorUid": "uid1", "updatedAt": "2026-11-08T00:00:00Z" }` -> Rejected by `skor_angka >= 0 && skor_angka <= 100`.
11. **Self-Assigned Admin Privilege Escalation (`/admins/attacker_uid`)**:
    Non-admin user attempts to create `/admins/attacker_uid` -> Rejected because only verified bootstrapped admin can write `/admins`.
12. **Blanket Unfiltered List Scraping on `/students`**:
    Unauthenticated or non-owner user attempts `list` on `/students` without matching `authorUid` -> Rejected by Query Enforcer.
