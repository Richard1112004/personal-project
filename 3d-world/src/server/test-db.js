const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./user');

async function test() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected for test...");

    try {
        // Create a fake "Fondi" user
        const testUser = new User({
            username: "Hung_Tester_" + Math.floor(Math.random() * 1000),
            password: "password123",
            avatarModel: "Male_Casual.glb"
        });

        await testUser.save();
        console.log("✨ SUCCESS: User saved to MongoDB Atlas!");
        
        const count = await User.countDocuments();
        console.log(`📊 Total users in database: ${count}`);

    } catch (err) {
        console.error("❌ Test failed:", err.message);
    } finally {
        mongoose.connection.close();
    }
}
test();