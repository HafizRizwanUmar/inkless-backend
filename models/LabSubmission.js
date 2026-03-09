const mongoose = require('mongoose');

const LabSubmissionSchema = new mongoose.Schema({
    labTask: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabTask',
        required: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    submittedDocument: {
        type: String // path to submitted zip or pdf
    },
    answers: [{
        questionId: { type: mongoose.Schema.Types.ObjectId }, // Link to specific question in LabTask
        codeFiles: [{
            fileName: { type: String, required: true },
            content: { type: String, required: true }
        }],
        output: { type: String },
        text: { type: String },
        images: [{ type: String }] // Array of Paths
    }],
    status: {
        type: String,
        enum: ['submitted', 'graded'],
        default: 'submitted'
    },
    obtainedMarks: {
        type: Number
    },
    teacherFeedback: {
        type: String
    },
    submittedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('LabSubmission', LabSubmissionSchema);
