const mongoose = require('mongoose');

const SubmissionSchema = new mongoose.Schema({
    assignment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Assignment',
        required: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    codeContent: {
        type: String // For "program in c++"
    },
    outputContent: {
        type: String // Text output
    },
    imagePath: {
        type: String // URL/Path for image submission
    },
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

module.exports = mongoose.model('Submission', SubmissionSchema);
