const express = require ("express");
const cors = require("cors")
const mongoose = require("mongoose")
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const schedule = require('node-schedule');

const app = express();
app.use(express.json());
app.use(cors());
const port = 9866;
const url = "mongodb+srv://RemainderApp:RemainderApp@remainderapp.lzvfcil.mongodb.net/?retryWrites=true&w=majority&appName=RemainderApp";

app.listen(port,()=>{
    console.log(`Server Running on Port ${port}`)
}
)
let connectToMDB = async ()=>{
    try {
        await mongoose.connect(url);
        console.log("Connected to Database ✅ ")
    } catch (error) {
        console.log("Unable to onnect to Database ❌ ")
    }
}
connectToMDB();

// Configure Nodemailer Transporter
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "santhan.machavarapu@gmail.com", // Your email
      pass: "vgpy ddru fxlz tson", // Use an App Password for Gmail
    },
  });

const userSchema = new mongoose.Schema({
    name: String,
    email : String,
    password : String,
})
const User = mongoose.model("User",userSchema);

// Signup Route
app.post("/signup", async (req, res) => {
    try {
      const { name, email, password } = req.body;
  
      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) return res.status(400).json({ message: "User already exists" });
  
      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);
  
      // Create new user
      const newUser = new User({ name, email, password: hashedPassword });
      await newUser.save();
  
      res.status(201).json({ message: "User registered successfully" });
    } catch (error) {
      res.status(500).json({ message: "Server error", error });
    }
  });

//   / Login Route
app.post("/login", async (req, res) => {
    try {
      const { email, password } = req.body;
  
      // Check if user exists
      const user = await User.findOne({ email });
      if (!user) return res.status(400).json({ message: "Invalid email or password" });
  
      // Compare passwords using bcrypt
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        // Send alert email on wrong password attempt
        const alertMailOptions = {
          from: "santhan.machavarapu@gmail.com",
          to: email,
          subject: "⚠️ Alert: Wrong Password Attempt",
          text: `Dear ${user.name},\n\nAn incorrect password was entered for your account. If this wasn't you, please reset your password immediately.\n\nBest Regards,\nRemainder Application`,
        };
        transporter.sendMail(alertMailOptions, (err, info) => {
          if (err) console.error("Error sending alert email:", err);
        });
  
        return res.status(400).json({ message: "Invalid email or password" });
      }
  
      // Send success email on successful login
      const successMailOptions = {
        from: "santhan.machavarapu@gmail.com",
        to: email,
        subject: "✅ Login Successful",
        text: `Dear ${user.name},\n\nYou have successfully logged into your Remainder Application account.\n\nBest Regards,\nRemainder Application`,
      };
      transporter.sendMail(successMailOptions, (err, info) => {
        if (err) console.error("Error sending success email:", err);
      });
  
      res.status(200).json({ message: "Login successful", user });
    } catch (error) {
      res.status(500).json({ message: "Server error", error });
    }
  });
//   Get user Details
app.get("/user/:id",(req,res)=>{
    const id=req.params.id;
    User.findById(id).then((user)=>{
        res.json(user);
    })
})
  

const RemainderSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    setTime: {
        type: String, // Storing time in HH:MM AM/PM format
        required: true
    },
    fromDate: {
        type: Date,
        required: true
    },
    toDate: {
        type: Date,
        required: true
    },
    transcribedText: {
        type: String,
        default: ''
    },
    userId:{
        type:String,
    }
}, { timestamps: true });
const Remainder = mongoose.model('Remainder', RemainderSchema);

// POST API to create a reminder
app.post('/addRemainder', async (req, res) => {
    console.log(req.body)
    try {
      const { title, setTime, fromDate, toDate, transcribedText,userId } = req.body;
      const newReminder = new Remainder({ title, setTime, fromDate, toDate, transcribedText,userId });
      await newReminder.save();
      res.status(201).json({ message: 'Reminder created successfully', reminder: newReminder });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

// Get Remainders of Particular user Id
app.get('/getRemainder/:id/:title', async (req,res)=>{
    const id=req.params.id;
    const title=req.params.title;
    try {
        const reminders = await Remainder.find({userId:id,title:title});
        res.status(200).json(reminders);
    } catch (error) {
        console.log(error);
    }
})

// Function to check and process reminders
async function checkReminders() {
  try {
    const now = new Date();
    // Format current time as HH:MM (24-hour format)
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    // Find reminders that should trigger now
    const activeReminders = await Remainder.find({
      setTime: currentTime,
      fromDate: { $lte: now },
      toDate: { $gte: now }
    });
    
    // Send notifications for each active reminder
    activeReminders.forEach(async (reminder) => {
      try {
        // Find the user to get their email
        const user = await User.findById(reminder.userId);
        if (user && user.email) {
          // Send email notification
          const mailOptions = {
            from: "santhan.machavarapu@gmail.com",
            to: user.email,
            subject: `⏰ Reminder: ${reminder.title}`,
            text: `Dear ${user.name},\n\nThis is a reminder for your "${reminder.title}" task.\n\nDetails: ${reminder.transcribedText}\n\nBest Regards,\nRemainder Application`,
          };
          
          transporter.sendMail(mailOptions, (err, info) => {
            if (err) console.error("Error sending reminder email:", err);
            else console.log(`Reminder email sent to ${user.email}`);
          });
        }
      } catch (error) {
        console.error("Error processing reminder:", error);
      }
    });
  } catch (error) {
    console.error("Error checking reminders:", error);
  }
}

// Schedule to run every minute to check reminders
const reminderJob = schedule.scheduleJob('* * * * *', checkReminders);

// API endpoint to manually check reminders
app.get('/checkReminders', async (req, res) => {
  try {
    await checkReminders();
    res.status(200).json({ message: "Reminder check triggered successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all reminders for a user (for notifications in frontend)
app.get('/getAllReminders/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    let reminders = await Remainder.find({ userId: userId });
    
    // Ensure dates are properly formatted before sending to client
    reminders = reminders.map(reminder => {
      // Convert Mongoose document to plain object
      const reminderObj = reminder.toObject();
      
      // Make sure fromDate and toDate are proper Date objects
      if (reminderObj.fromDate) {
        reminderObj.fromDate = new Date(reminderObj.fromDate);
      }
      if (reminderObj.toDate) {
        reminderObj.toDate = new Date(reminderObj.toDate);
      }
      
      return reminderObj;
    });
    
    res.status(200).json(reminders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});