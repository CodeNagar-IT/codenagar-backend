// backend/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

// ========== CORS CONFIGURATION ==========
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Ensure uploads directory exists
const uploadsDir = './uploads/resumes';
if (!fs.existsSync(uploadsDir)){
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ========== MONGODB CONNECTION ==========

// Remove deprecated options - use this simpler connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Add connection event handlers
mongoose.connection.on('connected', () => {
  console.log('✅ Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ Mongoose disconnected from MongoDB');
});

// ========== SCHEMAS ==========

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  city: { type: String, default: '' },
  bio: { type: String, default: '' },
  role: { type: String, default: 'user' },
  createdAt: { type: Date, default: Date.now }
});

// Course Application Schema
const courseAppSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  course: { type: String, required: true },
  education: String,
  experience: String,
  message: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, default: 'pending' },
  appliedAt: { type: Date, default: Date.now }
});

// Product Schema
const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  price: { type: Number, required: true },
  originalPrice: Number,
  description: String,
  specs: String,
  stock: { type: Number, default: 0 },
  images: [String],
  featured: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Order Schema
const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    price: Number,
    quantity: Number
  }],
  total: { type: Number, required: true },
  shippingAddress: {
    street: String,
    city: String,
    zipCode: String,
    country: String
  },
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

// Contact Message Schema
const contactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: String,
  subject: String,
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Career Application Schema
const careerSchema = new mongoose.Schema({
  position: String,
  fullName: String,
  email: String,
  phone: String,
  experience: String,
  resume: String,
  coverLetter: String,
  status: { type: String, default: 'pending' },
  appliedAt: { type: Date, default: Date.now }
});

// Event Schema
const eventSchema = new mongoose.Schema({
  title: String,
  description: String,
  date: Date,
  location: String,
  price: Number,
  seats: Number,
  image: String,
  registrations: [{
    name: String,
    email: String,
    phone: String,
    registeredAt: { type: Date, default: Date.now }
  }]
});

// Newsletter Schema
const newsletterSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  subscribedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const CourseApp = mongoose.model('CourseApp', courseAppSchema);
const Product = mongoose.model('Product', productSchema);
const Order = mongoose.model('Order', orderSchema);
const Contact = mongoose.model('Contact', contactSchema);
const Career = mongoose.model('Career', careerSchema);
const Event = mongoose.model('Event', eventSchema);
const Newsletter = mongoose.model('Newsletter', newsletterSchema);

// ========== MIDDLEWARE ==========

// Authentication Middleware
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Admin Middleware
const adminAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// ========== AUTH ROUTES ==========

// Signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword });
    await user.save();
    
    const token = jwt.sign(
      { id: user._id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.status(201).json({ 
      token, 
      user: { id: user._id, name, email, role: user.role } 
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { id: user._id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({ 
      token, 
      user: { id: user._id, name: user.name, email: user.email, role: user.role } 
    });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// Get Current User
app.get('/api/auth/me', auth, async (req, res) => {
  res.json(req.user);
});

// ========== USER PROFILE ROUTES ==========

// Update Profile
app.put('/api/users/profile', auth, async (req, res) => {
  try {
    const { name, phone, address, city, bio } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name, phone, address, city, bio },
      { new: true, runValidators: true }
    ).select('-password');
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Change Password
app.put('/api/users/password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    
    const user = await User.findById(req.user._id);
    
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ========== COURSE ROUTES ==========

// Apply for Course (No auth required for now)
app.post('/api/courses/apply', async (req, res) => {
  try {
    const application = new CourseApp(req.body);
    await application.save();
    res.status(201).json({ success: true, message: 'Application submitted!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get User's Applications
app.get('/api/courses/my-applications', auth, async (req, res) => {
  const apps = await CourseApp.find({ userId: req.user._id }).sort({ appliedAt: -1 });
  res.json(apps);
});

// Get All Applications (Admin)
app.get('/api/courses/applications', adminAuth, async (req, res) => {
  const apps = await CourseApp.find().sort({ appliedAt: -1 }).populate('userId', 'name email');
  res.json(apps);
});

// Update Application Status (Admin)
app.put('/api/courses/applications/:id', adminAuth, async (req, res) => {
  const app = await CourseApp.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  res.json(app);
});

// ========== PRODUCT ROUTES ==========

// Get All Products
app.get('/api/products', async (req, res) => {
  const { category, featured } = req.query;
  let filter = {};
  if (category && category !== 'all') filter.category = category;
  if (featured === 'true') filter.featured = true;
  const products = await Product.find(filter);
  res.json(products);
});

// Get Single Product
app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(400).json({ error: 'Invalid product ID' });
  }
});

// Create Product (Admin)
app.post('/api/products', adminAuth, async (req, res) => {
  const product = new Product(req.body);
  await product.save();
  res.status(201).json(product);
});

// Update Product (Admin)
app.put('/api/products/:id', adminAuth, async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  res.json(product);
});

// Delete Product (Admin)
app.delete('/api/products/:id', adminAuth, async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ========== ORDER ROUTES ==========

// Create Order
app.post('/api/orders', auth, async (req, res) => {
  try {
    const order = new Order({ ...req.body, userId: req.user._id });
    await order.save();
    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get User Orders
app.get('/api/orders', auth, async (req, res) => {
  const orders = await Order.find({ userId: req.user._id }).sort({ createdAt: -1 });
  res.json(orders);
});

// Get All Orders (Admin)
app.get('/api/orders/all', adminAuth, async (req, res) => {
  const orders = await Order.find().populate('userId', 'name email').sort({ createdAt: -1 });
  res.json(orders);
});

// Update Order Status (Admin)
app.put('/api/orders/:id', adminAuth, async (req, res) => {
  const order = await Order.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  res.json(order);
});

// ========== CONTACT ROUTES ==========

// Submit Contact Form
app.post('/api/contact', async (req, res) => {
  try {
    const message = new Contact(req.body);
    await message.save();
    res.status(201).json({ success: true, message: 'Message sent successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get All Messages (Admin)
app.get('/api/contacts', adminAuth, async (req, res) => {
  const messages = await Contact.find().sort({ createdAt: -1 });
  res.json(messages);
});

// Get Single Message (Admin)
app.get('/api/contacts/:id', adminAuth, async (req, res) => {
  const message = await Contact.findById(req.params.id);
  if (!message) return res.status(404).json({ error: 'Message not found' });
  res.json(message);
});

// Mark Message as Read (Admin)
app.put('/api/contacts/:id/read', adminAuth, async (req, res) => {
  const message = await Contact.findByIdAndUpdate(req.params.id, { read: true }, { new: true });
  res.json(message);
});

// Delete Message (Admin)
app.delete('/api/contact/:id', adminAuth, async (req, res) => {
  await Contact.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ========== CAREER ROUTES ==========

// File Upload Setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, './uploads/resumes/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /pdf|doc|docx/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only .pdf, .doc, .docx files are allowed'));
  }
};

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter
});

// Apply for Job
app.post('/api/careers/apply', upload.single('resume'), async (req, res) => {
  try {
    const application = new Career({
      ...req.body,
      resume: req.file ? req.file.path : null
    });
    await application.save();
    res.status(201).json({ success: true, message: 'Application submitted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get All Applications (Admin)
app.get('/api/careers/applications', adminAuth, async (req, res) => {
  const apps = await Career.find().sort({ appliedAt: -1 });
  res.json(apps);
});

// Get Single Application (Admin)
app.get('/api/careers/applications/:id', adminAuth, async (req, res) => {
  const app = await Career.findById(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  res.json(app);
});

// Update Application Status (Admin)
app.put('/api/careers/applications/:id', adminAuth, async (req, res) => {
  const app = await Career.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  res.json(app);
});

// ========== EVENT ROUTES ==========

// Get All Events
app.get('/api/events', async (req, res) => {
  const events = await Event.find().sort({ date: 1 });
  res.json(events);
});

// Get Single Event
app.get('/api/events/:id', async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json(event);
});

// Register for Event
app.post('/api/events/:id/register', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    
    if (event.registrations.length >= event.seats) {
      return res.status(400).json({ error: 'Event is full' });
    }
    
    event.registrations.push(req.body);
    await event.save();
    res.json({ success: true, message: 'Registration successful' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Event (Admin)
app.post('/api/events', adminAuth, async (req, res) => {
  const event = new Event(req.body);
  await event.save();
  res.status(201).json(event);
});

// Update Event (Admin)
app.put('/api/events/:id', adminAuth, async (req, res) => {
  const event = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(event);
});

// Delete Event (Admin)
app.delete('/api/events/:id', adminAuth, async (req, res) => {
  await Event.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ========== NEWSLETTER ROUTES ==========

// Subscribe to Newsletter
app.post('/api/newsletter', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    const existing = await Newsletter.findOne({ email });
    if (existing) {
      return res.status(400).json({ error: 'Already subscribed' });
    }
    const sub = new Newsletter({ email });
    await sub.save();
    res.json({ success: true, message: 'Subscribed successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get All Subscribers (Admin)
app.get('/api/newsletter/subscribers', adminAuth, async (req, res) => {
  const subscribers = await Newsletter.find();
  res.json(subscribers);
});

// Delete Subscriber (Admin)
app.delete('/api/newsletter/:id', adminAuth, async (req, res) => {
  await Newsletter.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ========== STATS ROUTE (Admin) ==========
app.get('/api/stats', adminAuth, async (req, res) => {
  const stats = {
    users: await User.countDocuments(),
    orders: await Order.countDocuments(),
    products: await Product.countDocuments(),
    applications: await CourseApp.countDocuments(),
    messages: await Contact.countDocuments(),
    careers: await Career.countDocuments(),
    events: await Event.countDocuments(),
    subscribers: await Newsletter.countDocuments()
  };
  res.json(stats);
});

// ========== HEALTH CHECK ROUTE ==========
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ========== INITIAL PRODUCTS (Run once) ==========
const initializeProducts = async () => {
  const count = await Product.countDocuments();
  if (count === 0) {
    const sampleProducts = [
      { name: "Gaming PC", category: "Computers", price: 899, originalPrice: 1099, description: "High-performance gaming PC with RTX 3060", specs: "Intel i7, 16GB RAM, 1TB SSD", stock: 10, featured: true },
      { name: "4K Monitor", category: "Displays", price: 349, originalPrice: 499, description: "27-inch 4K UHD Monitor", specs: "144Hz, IPS Panel, HDR", stock: 15, featured: true },
      { name: "Mechanical Keyboard", category: "Peripherals", price: 89, originalPrice: 129, description: "RGB Mechanical Keyboard", specs: "Blue Switches, Programmable", stock: 25, featured: false },
      { name: "Gaming Mouse", category: "Peripherals", price: 49, originalPrice: 79, description: "High-precision gaming mouse", specs: "16K DPI, RGB, 8 Buttons", stock: 30, featured: false },
      { name: "Wireless Headset", category: "Audio", price: 129, originalPrice: 199, description: "7.1 Surround Sound Headset", specs: "Noise Cancelling, 20hr Battery", stock: 20, featured: true },
      { name: "Phone Case", category: "Mobile", price: 19, description: "Shockproof Phone Case", specs: "Military Grade Protection", stock: 100, featured: false },
    ];
    await Product.insertMany(sampleProducts);
    console.log('✅ Sample products added');
  }
};
initializeProducts();

// ========== ERROR HANDLING MIDDLEWARE ==========
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// ========== 404 HANDLER ==========
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 API available at http://localhost:${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/api/health`);
});