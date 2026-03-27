const mongoose = require('mongoose');
const bcrypt = require('bcrypt'); // 1. Imports at the top

// 2. Define the Schema first
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    avatarModel: { type: String, default: 'Male_Casual.glb' },
}, { timestamps: true });

// 3. Add Middleware (MUST be after UserSchema is defined)
// Remove the 'next' parameter if you are using 'async'
UserSchema.pre('save', async function() {
    // Only hash the password if it has been modified (or is new)
    if (!this.isModified('password')) return;

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    } catch (err) {
        throw err; // In async middleware, throwing an error stops the save automatically
    }
});

// 4. Add Methods
UserSchema.methods.comparePassword = function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

// 5. Export the Model last
module.exports = mongoose.model('User', UserSchema);