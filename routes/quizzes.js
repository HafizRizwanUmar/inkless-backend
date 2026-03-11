const express = require('express');
const router = express.Router();
const Quiz = require('../models/Quiz');
const QuizAttempt = require('../models/QuizAttempt');
const Class = require('../models/Class');
const jwt = require('jsonwebtoken');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Function to get a Gemini model instance safely
const getGeminiModel = () => {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not set in the environment.");
    }
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // Use gemini-1.5-flash for general text tasks
    return genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

};

// Middleware to verify token (duplicated from classes.js, ideally should be in valid middleware file)
const auth = (req, res, next) => {
    const token = req.header('x-auth-token');
    if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        req.user = decoded.user;
        next();
    } catch (e) {
        res.status(400).json({ msg: 'Token is not valid' });
    }
};

// @route   POST api/quizzes/generate
// @desc    Generate quiz questions using Gemini AI
// @access  Private (Teacher)
router.post('/generate', auth, async (req, res) => {
    const { material, numQuestions, types } = req.body;

    if (!material) {
        return res.status(400).json({ msg: 'Material text is required for generation.' });
    }

    try {
        const model = getGeminiModel();

        const prompt = `
You are an expert teacher creating a quiz based on the following material:
---
${material}
---

Create exactly ${numQuestions || 5} questions of the following types: ${types ? types.join(', ') : 'MCQ, SHORT, LONG'}.

Return ONLY a valid JSON array of objects representing the questions. DO NOT include any markdown formatting like \`\`\`json.
Each object must follow this exact structure according to its type:

For 'MCQ':
{
  "type": "MCQ",
  "questionText": "The question...?",
  "options": [
    {"text": "Option A"},
    {"text": "Option B"},
    {"text": "Option C"},
    {"text": "Option D"}
  ],
  "correctOptionIndex": 0, // 0-based index of the correct option
  "points": 1 // integer
}

For 'SHORT' or 'LONG':
{
  "type": "SHORT", // or "LONG"
  "questionText": "The question...?",
  "points": 5 // integer points
}
`;

        const result = await model.generateContent(prompt);
        let textResult = result.response.text().trim();

        // Remove markdown formatting if the model still outputs it
        if (textResult.startsWith('```json')) {
            textResult = textResult.replace(/^```json/, '').replace(/```$/, '').trim();
        } else if (textResult.startsWith('```')) {
            textResult = textResult.replace(/^```/, '').replace(/```$/, '').trim();
        }

        const generatedQuestions = JSON.parse(textResult);

        res.json(generatedQuestions);
    } catch (err) {
        console.error("Gemini Generation Error:", err.message);
        res.status(500).json({ msg: 'Failed to generate quiz with AI', error: err.message });
    }
});

// @route   POST api/quizzes
// @desc    Create a quiz
// @access  Private (Teacher)
router.post('/', auth, async (req, res) => {
    const { title, description, classId, questions, timeLimitMinutes, startTime, endTime } = req.body;

    try {
        // Verify user is teacher of the class
        const relatedClass = await Class.findById(classId);
        if (!relatedClass) {
            return res.status(404).json({ msg: 'Class not found' });
        }

        // Check if user is owner or teacher
        if (relatedClass.owner.toString() !== req.user.id && !relatedClass.teachers.includes(req.user.id)) {
            return res.status(403).json({ msg: 'Not authorized to create quiz for this class' });
        }

        const newQuiz = new Quiz({
            title,
            description,
            class: classId,
            questions,
            createdBy: req.user.id,
            timeLimitMinutes: timeLimitMinutes || null,
            startTime: startTime || null,
            endTime: endTime || null
        });

        const savedQuiz = await newQuiz.save();
        res.json(savedQuiz);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/quizzes/class/:classId
// @desc    Get all quizzes for a specific class
// @access  Private
router.get('/class/:classId', auth, async (req, res) => {
    try {
        const quizzes = await Quiz.find({ class: req.params.classId }).sort({ createdAt: -1 });
        res.json(quizzes);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/quizzes/:id
// @desc    Get quiz by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) return res.status(404).json({ msg: 'Quiz not found' });
        res.json(quiz);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/quizzes/attempt
// @desc    Submit a quiz attempt
// @access  Private (Student)
router.post('/attempt', auth, async (req, res) => {
    const { quizId, answers } = req.body;

    try {
        const quiz = await Quiz.findById(quizId);
        if (!quiz) return res.status(404).json({ msg: 'Quiz not found' });

        // Check if already attempted
        const existingAttempt = await QuizAttempt.findOne({ quiz: quizId, student: req.user.id });
        if (existingAttempt) {
            return res.status(400).json({ msg: 'You have already attempted this quiz' });
        }

        let score = 0;
        let totalPoints = 0;

        // Evaluation: Only MCQs are auto-graded on submission now.
        // AI marking for SHORT/LONG is triggered later by the teacher.

        // Calculate score
        for (let index = 0; index < quiz.questions.length; index++) {
            const question = quiz.questions[index];
            totalPoints += question.points || 1;

            const studentAnswer = answers.find(a => a.questionIndex === index);
            if (studentAnswer) {
                if (question.type === 'MCQ' || !question.type) {
                    if (studentAnswer.selectedOptionIndex === question.correctOptionIndex) {
                        score += question.points || 1;
                    }
                } else if ((question.type === 'SHORT' || question.type === 'LONG') && studentAnswer.textAnswer) {
                    // No AI marking on submission; mark as pending manual/AI review
                    // studentAnswer.aiFeedback = "Pending review."; // Removed as per instruction
                }
            }
        }

        const attempt = new QuizAttempt({
            quiz: quizId,
            student: req.user.id,
            answers,
            score,
            totalPoints,
            strikes: req.body.strikes || 0,
            tabSwitchCount: req.body.tabSwitchCount || 0,
            copyAttemptCount: req.body.copyAttemptCount || 0
        });

        const savedAttempt = await attempt.save();

        res.json({
            ...savedAttempt.toObject(),
            resultsShared: quiz.resultsShared
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/quizzes/attempt/:quizId
// @desc    Get user's attempt for a specific quiz
// @access  Private
router.get('/attempt/:quizId', auth, async (req, res) => {
    try {
        const attempt = await QuizAttempt.findOne({ quiz: req.params.quizId, student: req.user.id });
        if (!attempt) {
            return res.status(404).json({ msg: 'No attempt found' });
        }
        res.json(attempt);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/quizzes/submissions/:quizId
// @desc    Get ALL student attempts for a quiz (Teacher only)
// @access  Private (Teacher)
router.get('/submissions/:quizId', auth, async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.quizId);
        if (!quiz) return res.status(404).json({ msg: 'Quiz not found' });

        // Only the teacher/owner can view all submissions
        const Class = require('../models/Class');
        const relatedClass = await Class.findById(quiz.class);
        if (!relatedClass) return res.status(404).json({ msg: 'Class not found' });

        if (relatedClass.owner.toString() !== req.user.id && !relatedClass.teachers?.includes(req.user.id)) {
            return res.status(403).json({ msg: 'Not authorized' });
        }

        const attempts = await QuizAttempt.find({ quiz: req.params.quizId }).populate('student', 'name email');
        res.json({ quiz, attempts });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/quizzes/export/excel/:quizId
// @desc    Export quiz submissions as Excel file (Teacher only)
// @access  Private (Teacher)
router.get('/export/excel/:quizId', auth, async (req, res) => {
    try {
        const XLSX = require('xlsx');
        const quiz = await Quiz.findById(req.params.quizId);
        if (!quiz) return res.status(404).json({ msg: 'Quiz not found' });

        const relatedClass = await Class.findById(quiz.class);
        if (!relatedClass || (relatedClass.owner.toString() !== req.user.id && !relatedClass.teachers?.includes(req.user.id))) {
            return res.status(403).json({ msg: 'Not authorized' });
        }

        const attempts = await QuizAttempt.find({ quiz: req.params.quizId })
            .populate('student', 'name email')
            .sort({ score: -1 });

        const rows = attempts.map((att, rank) => ({
            'Rank': rank + 1,
            'Student Name': att.student?.name || 'Unknown',
            'Email': att.student?.email || '',
            'Score': att.score,
            'Total Points': att.totalPoints,
            'Percentage': att.totalPoints > 0 ? `${Math.round((att.score / att.totalPoints) * 100)}%` : '0%',
            'Tab Switches': att.tabSwitchCount || 0,
            'Copy Attempts': att.copyAttemptCount || 0,
            'Total Strikes': att.strikes || 0,
            'Submitted At': new Date(att.attemptedAt).toLocaleString()
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Submissions');

        // Column widths
        ws['!cols'] = [
            { wch: 6 }, { wch: 24 }, { wch: 30 }, { wch: 8 }, { wch: 12 },
            { wch: 12 }, { wch: 14 }, { wch: 15 }, { wch: 14 }, { wch: 22 }
        ];

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const safeName = quiz.title.replace(/[^a-z0-9]/gi, '_');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}_submissions.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/quizzes/export/pdf-zip/:quizId
// @desc    Export best/average/worst student reports as a ZIP of PDFs (Teacher only)
// @access  Private (Teacher)
router.get('/export/pdf-zip/:quizId', auth, async (req, res) => {
    try {
        const PDFDocument = require('pdfkit');
        const archiver = require('archiver');

        const quiz = await Quiz.findById(req.params.quizId);
        if (!quiz) return res.status(404).json({ msg: 'Quiz not found' });

        const relatedClass = await Class.findById(quiz.class);
        if (!relatedClass || (relatedClass.owner.toString() !== req.user.id && !relatedClass.teachers?.includes(req.user.id))) {
            return res.status(403).json({ msg: 'Not authorized' });
        }

        const attempts = await QuizAttempt.find({ quiz: req.params.quizId })
            .populate('student', 'name email')
            .sort({ score: -1 });

        if (attempts.length === 0) {
            return res.status(404).json({ msg: 'No submissions to export.' });
        }

        // Get best, average (closest to median), worst
        const best = attempts[0];
        const worst = attempts[attempts.length - 1];
        const midIdx = Math.floor(attempts.length / 2);
        const average = attempts[midIdx];

        const generatePDF = (att, label) => {
            return new Promise((resolve, reject) => {
                const chunks = [];
                const doc = new PDFDocument({ margin: 50 });
                doc.on('data', chunk => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));
                doc.on('error', reject);

                const pct = att.totalPoints > 0 ? Math.round((att.score / att.totalPoints) * 100) : 0;

                // Header
                doc.fontSize(22).font('Helvetica-Bold').text(quiz.title, { align: 'center' });
                doc.moveDown(0.3);
                doc.fontSize(13).font('Helvetica').fillColor('#666').text(`${label} Student Report`, { align: 'center' });
                doc.moveDown(1);

                // Divider
                doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').lineWidth(1).stroke();
                doc.moveDown(1);

                // Student info
                doc.fontSize(12).fillColor('#000').font('Helvetica-Bold').text('Student Information');
                doc.moveDown(0.4);
                doc.font('Helvetica').fontSize(11);
                doc.text(`Name:   ${att.student?.name || 'Unknown'}`);
                doc.text(`Email:  ${att.student?.email || ''}`);
                doc.text(`Submitted: ${new Date(att.attemptedAt).toLocaleString()}`);
                doc.moveDown(1);

                // Score summary
                doc.font('Helvetica-Bold').fontSize(12).text('Score Summary');
                doc.moveDown(0.4);
                doc.font('Helvetica').fontSize(11);
                doc.text(`Score:      ${att.score} / ${att.totalPoints}`);
                doc.text(`Percentage: ${pct}%`);
                doc.moveDown(1);

                // Anti-cheat section
                const strikes = att.strikes || 0;
                doc.font('Helvetica-Bold').fontSize(12).text('Academic Integrity');
                doc.moveDown(0.4);
                doc.font('Helvetica').fontSize(11);
                doc.text(`Tab Switches:    ${att.tabSwitchCount || 0}`);
                doc.text(`Copy Attempts:   ${att.copyAttemptCount || 0}`);
                doc.fillColor(strikes > 0 ? '#c0392b' : '#27ae60')
                    .font('Helvetica-Bold').text(`Total Strikes:   ${strikes}`)
                    .fillColor('#000');
                doc.moveDown(1);

                // Answers
                doc.font('Helvetica-Bold').fontSize(12).text('Answers');
                doc.moveDown(0.4);
                att.answers.forEach((ans, i) => {
                    doc.font('Helvetica-Bold').fontSize(10).text(`Q${ans.questionIndex + 1}:`, { continued: true });
                    if (ans.selectedOptionIndex !== undefined) {
                        doc.font('Helvetica').text(`  Option ${String.fromCharCode(65 + ans.selectedOptionIndex)} selected`);
                    } else if (ans.textAnswer) {
                        doc.font('Helvetica').text(`  ${ans.textAnswer.substring(0, 200)}${ans.textAnswer.length > 200 ? '...' : ''}`);
                    } else {
                        doc.font('Helvetica').fillColor('#999').text('  (No answer)').fillColor('#000');
                    }
                    if (ans.aiFeedback) {
                        doc.fontSize(9).fillColor('#555').text(`   AI Feedback: ${ans.aiFeedback}`).fillColor('#000').fontSize(10);
                    }
                    doc.moveDown(0.3);
                });

                doc.end();
            });
        };

        // Generate all 3 PDFs
        const safeTitle = quiz.title.replace(/[^a-z0-9]/gi, '_');
        const [bestPDF, avgPDF, worstPDF] = await Promise.all([
            generatePDF(best, 'Best'),
            generatePDF(average, 'Average'),
            generatePDF(worst, 'Worst')
        ]);

        // Pack into ZIP
        const safeName = safeTitle;
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}_reports.zip"`);
        res.setHeader('Content-Type', 'application/zip');

        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.on('error', err => { throw err; });
        archive.pipe(res);

        archive.append(bestPDF, { name: `Best_${best.student?.name || 'student'}.pdf`.replace(/\s+/g, '_') });
        archive.append(avgPDF, { name: `Average_${average.student?.name || 'student'}.pdf`.replace(/\s+/g, '_') });
        archive.append(worstPDF, { name: `Worst_${worst.student?.name || 'student'}.pdf`.replace(/\s+/g, '_') });

        await archive.finalize();
    } catch (err) {
        console.error(err.message);
        if (!res.headersSent) res.status(500).send('Server Error');
    }
});

// @route   GET api/quizzes/ai-status
// @desc    Check AI Availability
// @access  Private (Teacher)
router.get('/ai-status', auth, async (req, res) => {
    try {
        if (!process.env.GEMINI_API_KEY) {
            return res.json({ available: false, msg: 'API Key missing' });
        }
        res.json({ available: true, msg: 'Gemini 1.5 Flash' });
    } catch (err) {
        res.json({ available: false, msg: err.message });
    }
});

// @route   POST api/quizzes/grade-all/:quizId
// @desc    Grade all text-based submissions for a quiz using AI
// @access  Private (Teacher)
router.post('/grade-all/:quizId', auth, async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.quizId);
        if (!quiz) return res.status(404).json({ msg: 'Quiz not found' });

        const model = getGeminiModel();
        const attempts = await QuizAttempt.find({ quiz: req.params.quizId });

        if (attempts.length === 0) return res.status(400).json({ msg: 'No attempts to grade.' });

        let processedCount = 0;

        for (let attempt of attempts) {
            let totalNewScore = 0;
            let updated = false;

            for (let index = 0; index < quiz.questions.length; index++) {
                const question = quiz.questions[index];
                const studentAnswer = attempt.answers.find(a => a.questionIndex === index);
                if (!studentAnswer) continue;

                if (question.type === 'MCQ' || !question.type) {
                    if (studentAnswer.selectedOptionIndex === question.correctOptionIndex) {
                        totalNewScore += question.points || 1;
                    }
                } else if ((question.type === 'SHORT' || question.type === 'LONG') && studentAnswer.textAnswer) {
                    try {
                        const prompt = `
Question: ${question.questionText}
Max Points: ${question.points || 1}
Student Answer: ${studentAnswer.textAnswer}

Evaluate the student's answer. Return ONLY a valid JSON object (no markdown formatting) with:
{
  "score": <number between 0 and Max Points based on correctness>,
  "feedback": "<1-2 sentences explaining why they got this score>"
}
`;
                        const result = await model.generateContent(prompt);
                        let aiResponseText = result.response.text().trim();
                        if (aiResponseText.startsWith('```json')) aiResponseText = aiResponseText.replace(/^```json/, '').replace(/```$/, '').trim();
                        else if (aiResponseText.startsWith('```')) aiResponseText = aiResponseText.replace(/^```/, '').replace(/```$/, '').trim();

                        const aiGrading = JSON.parse(aiResponseText);
                        studentAnswer.aiFeedback = aiGrading.feedback;
                        totalNewScore += (parseInt(aiGrading.score, 10) || 0);
                        updated = true;
                    } catch (e) {
                        console.error("AI Batch Grade Error:", e.message);
                    }
                }
            }

            if (updated) {
                attempt.score = totalNewScore;
                await attempt.save();
                processedCount++;
            }
        }

        res.json({ msg: `Successfully processed ${processedCount} attempts with AI.` });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/quizzes/share-results/:quizId
// @desc    Toggle result visibility for students
// @access  Private (Teacher)
router.post('/share-results/:quizId', auth, async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.quizId);
        if (!quiz) return res.status(404).json({ msg: 'Quiz not found' });

        quiz.resultsShared = true;
        await quiz.save();

        const Notification = require('../models/Notification');
        const attempts = await QuizAttempt.find({ quiz: req.params.quizId });

        const notifications = attempts.map(att => ({
            recipient: att.student,
            sender: req.user.id,
            type: 'QUIZ',
            title: 'Quiz Results Shared',
            message: `Marks for "${quiz.title}" have been released by your teacher.`,
            link: `/student/quiz-attempt`
        }));

        if (notifications.length > 0) {
            await Notification.insertMany(notifications);
        }

        res.json({ msg: 'Results shared and notifications sent.' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;

