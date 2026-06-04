// includes most of your queries
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const db = require('./db');

const app = express();
const port = process.env.PORT || 5000;

// Routes
const productRoutes = require("./routes/productRoutes");
const stockRoutes = require("./routes/stockRoutes");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const shopRoutes = require("./routes/shopRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const reportRoutes = require("./routes/reportRoutes");
const activityLogRoutes = require("./routes/activityLogRoutes");

//Use
app.use(cors({
    origin: '*',
    credentials: false,
    optionsSuccessStatus: 200
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/products", productRoutes);
app.use("/stocks", stockRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/shops", shopRoutes);
app.use("/reports", reportRoutes);
app.use("/activity-logs", activityLogRoutes);



app.get('/test', (req, res) => {
    res.json({ message: "Hello from the server!" });
});


if (require.main === module) {
    db.connect((err) => {
        if (err) {
            console.error('Database connection failed:', err);
            process.exit(1);
        }

        app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
        });
    });
}

module.exports = { app };
