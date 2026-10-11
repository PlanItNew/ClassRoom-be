import {
    pgTable,
    uuid,
    varchar,
    timestamp,
    pgEnum,
    text,
    boolean,
    jsonb,
    decimal,
    integer,
    primaryKey,
    unique,
    index,
    bigint,

} from 'drizzle-orm/pg-core';


// Enums
export const userRoleEnum = pgEnum('user_role', ['TEACHER', 'STUDENT']);
export const joinStatusEnum = pgEnum('join_status', ['PENDING', 'APPROVED', 'REJECTED']);
export const attemptStatusEnum = pgEnum('attempt_status', ['IN_PROGRESS', 'SUBMITTED', 'ABANDONED']);
export const postStatusEnum = pgEnum('post_status', ['DRAFT', 'PUBLISHED', 'DELETED']);
export const attachmentStatusEnum = pgEnum('attachment_status', ['PENDING_UPLOAD', 'UPLOADED', 'FAILED', 'DELETED']);


// Tables
export const users = pgTable('users', {
    id: uuid('id').defaultRandom().primaryKey(),
    role: userRoleEnum('role').notNull(),
    fullName: varchar('full_name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).unique().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    password: varchar('password', { length: 1024 }).notNull(),
    userName: varchar('user_name', { length: 255 }).unique().notNull(),
    phoneNumber: varchar('phone_number', { length: 15 }).unique(),
    profilePictureUrl: varchar('profile_picture_url', { length: 1024 }),
    verified: boolean('verified').default(false).notNull()
});

export const subjects = pgTable('subjects', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 255 }).unique().notNull(),
    syllabusDescription: text('syllabus_description'),
    syllabusFileUrl: varchar('syllabus_file_url', { length: 1024 })
});

export const classrooms = pgTable('classrooms', {
    id: uuid('id').defaultRandom().primaryKey(),
    teacherId: uuid('teacher_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
        .references(() => subjects.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 255 }).notNull(),
    subject: varchar('subject', { length: 255 }),
    section: varchar('section', { length: 100 }),
    room: varchar('room', { length: 100 }),
    purpose: text('purpose'),
    description: text('description'),
    themeColor: varchar('theme_color', { length: 50 }).default('#1d4ed8'),
    joinCode: varchar('join_code', { length: 15 }).unique(),
    isArchived: boolean('is_archived').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
},
    (table) => ({
        teacherIdx: index('idx_classrooms_teacher').on(table.teacherId),
    })
);

export const classroomStudents = pgTable(
    'classroom_students',
    {
        classroomId: uuid('classroom_id')
            .notNull()
            .references(() => classrooms.id, { onDelete: 'cascade' }),
        studentId: uuid('student_id') // indexed 
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        status: joinStatusEnum('status').default('PENDING').notNull(),
        isNotificationRead: boolean('is_notification_read').default(false).notNull(),
        requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
        resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    },
    (table) => ({
        // Composite Primary Key for the junction table
        pk: primaryKey({ columns: [table.classroomId, table.studentId] }),
        studentIdx: index('idx_classroom_students_student').on(table.studentId), // Due to composite indexing , the indexing will appiled by default at classRomm as it  scan from the left to right but studentid will casue full Scan , so expilicitly added indexing to studentid.
    })
);

export const questionPapers = pgTable('question_papers', {
    id: uuid('id').defaultRandom().primaryKey(),
    teacherId: uuid('teacher_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    isPublished: boolean('is_published').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
},
    (table) => ({
        teacherIdx: index('idx_question_papers_teacher').on(table.teacherId),
    })
);

export const questions = pgTable('questions', {
    id: uuid('id').defaultRandom().primaryKey(),
    questionPaperId: uuid('question_paper_id') // indexed to get all question of the paper.
        .notNull()
        .references(() => questionPapers.id, { onDelete: 'cascade' }),
    questionText: text('question_text').notNull(),
    options: jsonb('options').notNull(),
    correctAnswer: varchar('correct_answer', { length: 255 }).notNull(),
    reason: text('reason'),
    marksAwarded: decimal('marks_awarded', { precision: 5, scale: 2 }).default('1.00').notNull(),
    orderSequence: integer('order_sequence').default(1).notNull(),
},
    (table) => ({
        paperIdx: index('idx_questions_paper').on(table.questionPaperId)
    })

);

export const exams = pgTable('exams', {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id') // indexed Reason :- student's dashboard can quickly load the list of all exams scheduled for their specific class
        .notNull()
        .references(() => classrooms.id, { onDelete: 'cascade' }),
    questionPaperId: uuid('question_paper_id') // indexed 
        .notNull()
        .references(() => questionPapers.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    scheduledStart: timestamp('scheduled_start', { withTimezone: true }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
},
    (table) => ({
        classroomIdx: index('idx_exams_classroom').on(table.classroomId),
    })
);

export const examAttempts = pgTable(
    'exam_attempts',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        examId: uuid('exam_id')
            .notNull()
            .references(() => exams.id, { onDelete: 'cascade' }),
        studentId: uuid('student_id') // indexed to get all attempts given by the student.
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        status: attemptStatusEnum('status').default('IN_PROGRESS').notNull(),
        startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
        completedAt: timestamp('completed_at', { withTimezone: true }),
        totalScore: decimal('total_score', { precision: 5, scale: 2 }),
    },
    (table) => ({
        // Constraint: A student can only have one attempt per exam
        unqAttempt: unique().on(table.examId, table.studentId),
        examIdx: index('idx_exam_attempts_exam').on(table.examId),
        studentIdx: index('idx_exam_attempts_student').on(table.studentId),
    })
);

export const attemptAnswers = pgTable(
    'attempt_answers',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        examAttemptId: uuid('exam_attempt_id') // indexed to fastly pull the attemp 
            .notNull()
            .references(() => examAttempts.id, { onDelete: 'cascade' }),
        questionId: uuid('question_id')
            .notNull()
            .references(() => questions.id, { onDelete: 'cascade' }),
        selectedOption: varchar('selected_option', { length: 255 }),
        marksObtained: decimal('marks_obtained', { precision: 5, scale: 2 }),
        isCorrect: boolean('is_correct'),
        reason: text('option_reason'),
        answeredAt: timestamp('answered_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => ({
        // Constraint: A student can only have one recorded answer per question in a specific attempt
        unqAnswer: unique().on(table.examAttemptId, table.questionId),
        questionId: index('idx_attempt_answers_question').on(table.questionId)
    })
);

export const refreshTokens = pgTable('refresh_tokens', {
    userId: uuid('user_id')
        .primaryKey()
        .references(() => users.id, { onDelete: 'cascade' }),
    token_hash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});


export const posts = pgTable('posts', {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
        .notNull()
        .references(() => classrooms.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content'),
    status: postStatusEnum('status').default('DRAFT').notNull(),
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
},
    (table) => ({
        classroomPublishedIdx: index('idx_posts_classroom_published').on(table.classroomId, table.publishedAt),
        classroomStatusIdx: index('idx_posts_classroom_status').on(table.classroomId, table.status),
        teacherIdx: index('idx_posts_teacher').on(table.teacherId),
    })
);

export const postAttachments = pgTable('post_attachments', {
    id: uuid('id').defaultRandom().primaryKey(),
    postId: uuid('post_id')
        .notNull()
        .references(() => posts.id, { onDelete: 'cascade' }),
    s3Key: text('s3_key').notNull().unique(),
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    status: attachmentStatusEnum('status').default('PENDING_UPLOAD').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
},
    (table) => ({
        postIdx: index('idx_post_attachments_post').on(table.postId),
        postStatusIdx: index('idx_post_attachments_post_status').on(table.postId, table.status),
    })
);

// Backward-compatible exports
export const classroomPost = posts;
export const attachments = postAttachments;

