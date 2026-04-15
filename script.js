
// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, collection, addDoc, deleteDoc, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- YOUR FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyDv6Dy824X2Lf4bM-EX16Xd2wja3gfohE4",
    authDomain: "expenseflow-ca6f6.firebaseapp.com",
    projectId: "expenseflow-ca6f6",
    storageBucket: "expenseflow-ca6f6.firebasestorage.app",
    messagingSenderId: "689636608454",
    appId: "1:689636608454:web:2dc401f1030e1080e30ac7",
    measurementId: "G-K2L8W5Y8GN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app); // Analytics initialized
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// --- GLOBAL STATE ---
let currentUser = null;
let userData = {
    isSetup: false,
    settings: { currency: '$', budget: 2000, userName: 'User', theme: 'light' },
    transactions: [],
    categories: [
        { id: 'cat_1', name: 'Food', color: '#EF4444' },
        { id: 'cat_2', name: 'Transport', color: '#F59E0B' },
        { id: 'cat_3', name: 'Utilities', color: '#10B981' }
    ]
};

let unsubscribeUserData = null; // Listener for database changes

// --- AUTH LOGIC ---

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        loadUserData(user.uid);
    } else {
        currentUser = null;
        showLogin();
    }
});

window.handleGoogleLogin = () => {
    document.getElementById('auth-loading').classList.remove('hidden');
    signInWithPopup(auth, provider)
        .then(() => { /* onAuthStateChanged handles the rest */ })
        .catch((error) => {
            console.error(error);
            alert("Login Failed: " + error.message);
            document.getElementById('auth-loading').classList.add('hidden');
        });
};

window.handleLogout = () => {
    if(confirm("Logout?")) {
        signOut(auth);
        location.reload(); // Clean reset
    }
};

// --- DATABASE LOGIC (FIRESTORE) ---

function loadUserData(uid) {
    const userRef = doc(db, "users", uid);
    
    // Realtime listener: Updates UI whenever database changes
    unsubscribeUserData = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
            userData = docSnap.data();
            // Ensure defaults if missing
            if(!userData.transactions) userData.transactions = [];
            if(!userData.categories) userData.categories = [];
            
            if (userData.isSetup) {
                showApp();
            } else {
                showOnboarding();
            }
        } else {
            // New User (First time login)
            showOnboarding();
        }
    });
}

async function saveUserData() {
    if (!currentUser) return;
    try {
        // Merge true ensures we don't overwrite fields if we only update part of the object
        await setDoc(doc(db, "users", currentUser.uid), userData, { merge: true });
    } catch (e) {
        console.error("Error saving: ", e);
        showToast("Save failed!", "error");
    }
}

// --- APP FLOW (VIEW SWITCHING) ---

function showLogin() {
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('onboarding-view').classList.add('hidden');
    document.getElementById('app-container').classList.add('hidden');
    if(unsubscribeUserData) unsubscribeUserData();
}

function showOnboarding() {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('onboarding-view').classList.remove('hidden');
    document.getElementById('app-container').classList.add('hidden');
    
    // Pre-fill if data exists from previous attempt
    if(userData.settings) {
        document.getElementById('setupName').value = userData.settings.userName || '';
        document.getElementById('setupBudget').value = userData.settings.budget || '';
        document.getElementById('setupCurrency').value = userData.settings.currency || '$';
    }
}

window.handleOnboarding = (e) => {
    e.preventDefault();
    userData.isSetup = true;
    userData.settings.userName = document.getElementById('setupName').value;
    userData.settings.budget = parseFloat(document.getElementById('setupBudget').value);
    userData.settings.currency = document.getElementById('setupCurrency').value;
    
    saveUserData().then(() => {
        showApp();
    });
};

function showApp() {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('onboarding-view').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
    
    initUI();
}

// --- UI LOGIC ---

function initUI() {
    applyTheme(userData.settings.theme);
    updateHeader();
    renderCategories();
    renderDashboard();
    
    // Setup inputs
    document.getElementById('settingsName').value = userData.settings.userName;
    document.getElementById('settingsBudget').value = userData.settings.budget;
    
    // Populate currency selects
    const opts = ['$', '€', '£', '¥', '₱'];
    ['setupCurrency', 'settingsCurrency'].forEach(id => {
        const sel = document.getElementById(id);
        sel.innerHTML = opts.map(c => `<option value="${c}">${c}</option>`).join('');
        sel.value = userData.settings.currency;
    });
}

function updateHeader() {
    document.getElementById('userName').textContent = userData.settings.userName;
    document.getElementById('userAvatar').textContent = userData.settings.userName.charAt(0).toUpperCase();
}

window.switchView = (viewId) => {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    // Find the button that triggered this (event target) or select manually
    const btns = document.querySelectorAll('.nav-btn');
    if(viewId === 'dashboard') btns[0].classList.add('active');
    if(viewId === 'transactions') btns[1].classList.add('active');
    if(viewId === 'categories') btns[2].classList.add('active');
    if(viewId === 'settings') btns[3].classList.add('active');
    
    document.getElementById('sidebar').classList.remove('active');
    
    if(viewId === 'dashboard') renderDashboard();
};

window.toggleSidebar = () => document.getElementById('sidebar').classList.toggle('active');

// --- DATA OPERATIONS (Transactions & Categories) ---

window.handleExpenseSubmit = (e) => {
    e.preventDefault();
    const id = document.getElementById('expenseId').value || 'tx_' + Date.now();
    const transaction = {
        id: id,
        amount: parseFloat(document.getElementById('amount').value),
        date: document.getElementById('date').value,
        categoryId: document.getElementById('category').value,
        note: document.getElementById('note').value
    };

    // Update array (remove old if editing)
    userData.transactions = userData.transactions.filter(t => t.id !== id);
    userData.transactions.push(transaction);
    
    saveUserData().then(() => {
        closeModal();
        renderDashboard();
        showToast('Saved');
    });
};

window.deleteTransaction = (id) => {
    if(confirm('Delete?')) {
        userData.transactions = userData.transactions.filter(t => t.id !== id);
        saveUserData().then(() => renderDashboard());
    }
};

window.addCategory = () => {
    const name = document.getElementById('newCategoryInput').value;
    const color = document.getElementById('newCategoryColor').value;
    if(name) {
        userData.categories.push({ id: 'cat_'+Date.now(), name, color });
        saveUserData().then(() => {
            renderCategories();
            document.getElementById('newCategoryInput').value = '';
        });
    }
};

window.updateSettings = () => {
    // Placeholder for real-time validation if needed
};

window.saveSettingsFromUI = () => {
    userData.settings.userName = document.getElementById('settingsName').value;
    userData.settings.budget = parseFloat(document.getElementById('settingsBudget').value);
    userData.settings.currency = document.getElementById('settingsCurrency').value;
    saveUserData().then(() => {
        updateHeader();
        renderDashboard();
        showToast('Settings Saved');
    });
};

window.toggleTheme = () => {
    userData.settings.theme = document.getElementById('themeToggle').checked ? 'dark' : 'light';
    applyTheme(userData.settings.theme);
    saveUserData();
};

function applyTheme(theme) {
    if(theme === 'dark') document.body.classList.add('dark-mode');
    else document.body.classList.remove('dark-mode');
    document.getElementById('themeToggle').checked = (theme === 'dark');
}

// --- RENDERING FUNCTIONS ---

function renderCategories() {
    const grid = document.getElementById('categoryGrid');
    grid.innerHTML = '';
    const select = document.getElementById('category');
    select.innerHTML = '';

    userData.categories.forEach(c => {
        // Grid Item
        const div = document.createElement('div');
        div.className = 'category-item';
        div.style.cssText = `background:var(--bg-card); padding:1rem; border-radius:12px; border:1px solid var(--border); position:relative;`;
        div.innerHTML = `<button onclick="window.deleteCategory('${c.id}')" style="position:absolute; top:5px; right:5px; color:red; background:none; border:none; cursor:pointer;">X</button><strong>${c.name}</strong><br><small>${c.color}</small>`;
        grid.appendChild(div);

        // Select Option
        const opt = document.createElement('option');
        opt.value = c.id; opt.text = c.name;
        select.appendChild(opt);
    });
}

window.deleteCategory = (id) => {
    if(confirm('Delete category?')) {
        userData.categories = userData.categories.filter(c => c.id !== id);
        saveUserData().then(renderCategories);
    }
};

function renderDashboard() {
    const tbody = document.getElementById('recentTransactionsBody');
    const allTbody = document.getElementById('allTransactionsBody');
    tbody.innerHTML = '';
    allTbody.innerHTML = '';

    // Sort by date desc
    const sorted = [...userData.transactions].sort((a,b) => new Date(b.date) - new Date(a.date));

    // Stats
    const total = sorted.reduce((acc, t) => acc + t.amount, 0);
    document.getElementById('totalBalance').textContent = userData.settings.currency + total.toFixed(2);

    const now = new Date();
    const monthly = sorted.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).reduce((acc, t) => acc + t.amount, 0);
    document.getElementById('monthlySpending').textContent = userData.settings.currency + monthly.toFixed(2);

    const budget = userData.settings.budget || 0;
    const pct = budget ? Math.min(100, (monthly/budget)*100) : 0;
    const el = document.getElementById('budgetStatus');
    el.textContent = Math.round(pct) + '%';
    el.style.color = pct > 90 ? 'red' : 'green';

    // Render Lists
    sorted.slice(0, 5).forEach(t => tbody.appendChild(createRow(t)));
    sorted.forEach(t => allTbody.appendChild(createRow(t)));

    drawCharts(sorted);
}

function createRow(t) {
    const cat = userData.categories.find(c => c.id === t.categoryId) || {name:'?', color:'#ccc'};
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td>${t.date}</td>
        <td><span class="category-tag" style="background:${cat.color}33; color:${cat.color}">${cat.name}</span></td>
        <td>${t.note}</td>
        <td style="font-weight:bold;">${userData.settings.currency}${t.amount.toFixed(2)}</td>
        <td>
            <button class="btn btn-sm btn-outline" onclick="window.editTransaction('${t.id}')">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="window.deleteTransaction('${t.id}')">X</button>
        </td>
    `;
    return tr;
}

window.editTransaction = (id) => {
    const t = userData.transactions.find(x => x.id === id);
    if(t) {
        document.getElementById('expenseId').value = t.id;
        document.getElementById('amount').value = t.amount;
        document.getElementById('date').value = t.date;
        document.getElementById('category').value = t.categoryId;
        document.getElementById('note').value = t.note;
        document.getElementById('modalTitle').textContent = "Edit Expense";
        openModal();
    }
};

window.openModal = () => {
    document.getElementById('expenseModal').classList.add('open');
    document.getElementById('date').value = new Date().toISOString().split('T')[0];
};
window.closeModal = () => {
    document.getElementById('expenseModal').classList.remove('open');
    document.getElementById('expenseForm').reset();
    document.getElementById('expenseId').value = '';
    document.getElementById('modalTitle').textContent = "Add Expense";
};

window.renderTransactions = () => {
    const term = document.getElementById('searchInput').value.toLowerCase();
    const filtered = userData.transactions.filter(t => 
        t.note.toLowerCase().includes(term) || t.amount.toString().includes(term)
    ).sort((a,b) => new Date(b.date) - new Date(a.date));
    
    const allTbody = document.getElementById('allTransactionsBody');
    allTbody.innerHTML = '';
    filtered.forEach(t => allTbody.appendChild(createRow(t)));
};

// --- CHARTS (Simple Canvas) ---
function drawCharts(transactions) {
    const canvas = document.getElementById('pieChart');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = 300; canvas.height = 300;
    ctx.clearRect(0,0,300,300);
    
    // Group by category
    const totals = {};
    transactions.forEach(t => {
        totals[t.categoryId] = (totals[t.categoryId] || 0) + t.amount;
    });
    
    let start = 0;
    const total = Object.values(totals).reduce((a,b)=>a+b,0);
    
    if (total === 0) {
        ctx.fillStyle = '#ccc';
        ctx.textAlign = 'center';
        ctx.fillText("No data", 150, 150);
        return;
    }
    
    Object.entries(totals).forEach(([catId, amt]) => {
        const cat = userData.categories.find(c => c.id === catId) || {color: '#999'};
        const slice = (amt/total) * 2 * Math.PI;
        ctx.beginPath();
        ctx.moveTo(150, 150);
        ctx.arc(150, 150, 100, start, start+slice);
        ctx.fillStyle = cat.color;
        ctx.fill();
        start += slice;
    });
    // Donut hole
    ctx.beginPath();
    ctx.arc(150, 150, 50, 0, 2*Math.PI);
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-card');
    ctx.fill();
}

function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.getElementById('toastContainer').appendChild(t);
    setTimeout(() => t.remove(), 3000);
}
