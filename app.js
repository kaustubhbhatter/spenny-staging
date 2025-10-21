// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyAmgOL0tYT-18VcfVmZ2CK5_79XfRLLAzs",
  authDomain: "my-expense-tracker-9d0f9.firebaseapp.com",
  projectId: "my-expense-tracker-9d0f9",
  storageBucket: "my-expense-tracker-9d0f9.firebasestorage.app",
  messagingSenderId: "384865958037",
  appId: "1:384865958037:web:0cfa22e56aaef3dfe9439c",
  measurementId: "G-E526DX0EVW"
};

// --- GLOBAL STATE ---
// We declare Firebase services here but will initialize them later.
let auth, db; 
let currentUser = null;
let currentMonth = new Date();
let currentTransactionType = 'expense';
let charts = {};

// Default data structure for new users or guests
const defaultAppData = {
    transactions: [],
    accounts: [],
    expenseCategories: [
        { id: 'exp1', name: 'Food & Dining', color: '#F44336', icon: '🍽️' },
        { id: 'exp2', name: 'Transportation', color: '#2196F3', icon: '🚗' },
        { id: 'exp3', name: 'Shopping', color: '#E91E63', icon: '🛍️' },
        { id: 'exp4', name: 'Bills & Utilities', color: '#FF9800', icon: '💡' }
    ],
    incomeCategories: [
        { id: 'inc1', name: 'Salary', color: '#4CAF50', icon: '💼' },
        { id: 'inc2', name: 'Business', color: '#2196F3', icon: '🏢' }
    ],
    accountTypes: [
        { id: 'type1', name: 'Bank Account', icon: '🏦', color: '#4CAF50' },
        { id: 'type2', name: 'Credit Card', icon: '💳', color: '#F44336' },
        { id: 'type3', name: 'Cash', icon: '💵', color: '#FF9800' }
    ],
    settings: { currency: '₹' }
};

// Main in-memory data object
let appData = JSON.parse(JSON.stringify(defaultAppData));


// --- INITIALIZATION ---
// This is the main entry point for the entire application.
document.addEventListener('DOMContentLoaded', function() {
    try {
        console.log('DOM fully loaded. Initializing Firebase...');
        // Initialize Firebase and assign to our global variables
        firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();

        console.log('Firebase initialized. Setting up the app...');
        // Now that Firebase is ready, we can safely set up the rest of the app
        setupEventListeners();
        handleAuthStateChange(); // This will trigger the first data load
    } catch (error) {
        console.error("CRITICAL: Firebase initialization failed.", error);
        // Display a user-friendly error if Firebase fails to load
        document.body.innerHTML = `<div style="text-align: center; padding: 50px;">
                                     <h1>Application Error</h1>
                                     <p>Could not connect to the backend service. Please check your internet connection and refresh the page.</p>
                                   </div>`;
    }
});

// --- AUTHENTICATION ---

// Listen for authentication state changes
function handleAuthStateChange() {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            console.log('User is signed in:', user.uid);
            currentUser = user;
            updateUIForUser(user);
            await handleDataOnLogin();
        } else {
            console.log('User is signed out.');
            currentUser = null;
            updateUIForGuest();
            loadDataFromLocalStorage();
        }
        render(); // Re-render the entire app after auth state is resolved and data is loaded
    });
}

// Check for local data and load from Firestore upon login
async function handleDataOnLogin() {
    const localDataExists = localStorage.getItem('transactions') !== null;

    if (localDataExists) {
        if (confirm("You have locally saved guest data. Do you want to upload it to your account? \n\nNote: This will overwrite any existing cloud data.")) {
            console.log("Uploading local data to Firestore...");
            loadDataFromLocalStorage(false); // Load into memory without re-rendering
            await saveData(); // Save the local data to Firestore
            localStorage.clear(); // Clean up local data after successful upload
            console.log("Local data cleared after upload.");
        }
    }
    // Load the authoritative data from Firestore
    await loadDataFromFirestore();
}

function updateUIForUser(user) {
    document.getElementById('user-info').style.display = 'flex';
    document.getElementById('user-email').textContent = user.email;
    document.getElementById('signin-btn').style.display = 'none';
    closeAuthModal();
}

function updateUIForGuest() {
    document.getElementById('user-info').style.display = 'none';
    document.getElementById('signin-btn').style.display = 'block';
}

// Auth Modal Controls (called by HTML onclick attributes)
function showAuthModal() { document.getElementById('auth-modal').classList.add('show'); }
function closeAuthModal() { document.getElementById('auth-modal').classList.remove('show'); }
function showSignUpForm() {
    document.getElementById('signin-form').style.display = 'none';
    document.getElementById('signup-form').style.display = 'block';
}
function showSignInForm() {
    document.getElementById('signup-form').style.display = 'none';
    document.getElementById('signin-form').style.display = 'block';
}

// Authentication Actions (called by HTML onclick attributes)
function signInWithEmail() {
    const email = document.getElementById('signin-email').value;
    const password = document.getElementById('signin-password').value;
    auth.signInWithEmailAndPassword(email, password)
        .catch(error => alert(`Sign-in failed: ${error.message}`));
}

function signUpWithEmail() {
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-confirm-password').value;

    if (password !== confirmPassword) {
        alert("Passwords do not match.");
        return;
    }
    auth.createUserWithEmailAndPassword(email, password)
        .catch(error => alert(`Sign-up failed: ${error.message}`));
}

function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .catch(error => alert(`Google sign-in failed: ${error.message}`));
}

function signOut() {
    if (confirm("Are you sure you want to sign out?")) {
        auth.signOut();
    }
}


// --- DATA PERSISTENCE ---

// Central function to save data. It decides where to save based on login status.
async function saveData() {
    if (currentUser) {
        await saveDataToFirestore();
    } else {
        saveDataToLocalStorage();
    }
}

// Save data to Firestore for logged-in users
async function saveDataToFirestore() {
    if (!currentUser) return;
    try {
        const userDocRef = db.collection('users').doc(currentUser.uid);
        await userDocRef.set(appData);
        console.log('Data saved to Firestore.');
    } catch (error) {
        console.error('Error saving to Firestore:', error);
        alert('Could not save data to the cloud. Please check your connection.');
    }
}

// Load data from Firestore for logged-in users
async function loadDataFromFirestore() {
    if (!currentUser) return;
    console.log('Loading data from Firestore...');
    try {
        const userDocRef = db.collection('users').doc(currentUser.uid);
        const doc = await userDocRef.get();

        if (doc.exists) {
            const data = doc.data();
            appData = { ...JSON.parse(JSON.stringify(defaultAppData)), ...data };
            console.log('Data loaded from Firestore document.');
        } else {
            console.log('No Firestore document found. Initializing new user data.');
            // This is a new user, initialize with sample data and save it.
            initializeSampleData();
            await saveDataToFirestore();
        }
    } catch (error) {
        console.error('Error loading from Firestore:', error);
        alert('Could not load data from the cloud. Using local data as a fallback.');
        loadDataFromLocalStorage();
    }
}


// --- LOCAL (GUEST) STORAGE ---

function saveDataToLocalStorage() {
    try {
        localStorage.setItem('transactions', JSON.stringify(appData.transactions));
        localStorage.setItem('accounts', JSON.stringify(appData.accounts));
        localStorage.setItem('expenseCategories', JSON.stringify(appData.expenseCategories));
        localStorage.setItem('incomeCategories', JSON.stringify(appData.incomeCategories));
        localStorage.setItem('accountTypes', JSON.stringify(appData.accountTypes));
        localStorage.setItem('settings', JSON.stringify(appData.settings));
        console.log('Data saved to localStorage (Guest mode).');
    } catch (e) {
        console.error('Failed to save to localStorage:', e);
    }
}

function loadDataFromLocalStorage(shouldRender = true) {
    console.log('Loading data from localStorage (Guest mode)...');
    const transactions = JSON.parse(localStorage.getItem('transactions'));
    
    // If no data, it's a new guest. Initialize with sample data.
    if (!transactions) {
        initializeSampleData();
        if(!currentUser) saveDataToLocalStorage(); // Save samples for guest
    } else {
        appData.transactions = transactions;
        appData.accounts = JSON.parse(localStorage.getItem('accounts')) || [];
        appData.expenseCategories = JSON.parse(localStorage.getItem('expenseCategories')) || defaultAppData.expenseCategories;
        appData.incomeCategories = JSON.parse(localStorage.getItem('incomeCategories')) || defaultAppData.incomeCategories;
        appData.accountTypes = JSON.parse(localStorage.getItem('accountTypes')) || defaultAppData.accountTypes;
        appData.settings = JSON.parse(localStorage.getItem('settings')) || { currency: '₹' };
    }

    if (shouldRender) {
        render();
    }
}


// --- SAMPLE DATA & UTILITIES ---

function initializeSampleData() {
    console.log('Initializing with sample data...');
    appData = JSON.parse(JSON.stringify(defaultAppData)); // Reset to defaults

    appData.accounts = [
        { id: 'acc1', name: 'ICICI Salary Account', type: 'Bank Account', balance: 45000, includeInTotal: true },
        { id: 'acc2', name: 'HDFC Credit Card', type: 'Credit Card', balance: -8500, includeInTotal: true, creditLimit: 100000, billingDay: 15, paymentDay: 25 },
        { id: 'acc3', name: 'Cash Wallet', type: 'Cash', balance: 5000, includeInTotal: true }
    ];

    const today = new Date();
    appData.transactions = [
        { id: generateId(), date: formatDate(today), type: 'income', amount: 50000, accountId: 'acc1', categoryId: 'inc1', description: 'Monthly salary', recurring: 'monthly' },
        { id: generateId(), date: formatDate(new Date(today.getTime() - 2 * 86400000)), type: 'expense', amount: 2500, accountId: 'acc2', categoryId: 'exp1', description: 'Grocery shopping', recurring: 'none' }
    ];
}


// --- EVENT LISTENERS (UNCHANGED CORE LOGIC) ---
function setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tab = this.dataset.tab;
            switchTab(tab);
        });
    });

    document.getElementById('tx-account').addEventListener('change', () => {
    if (currentTransactionType === 'transfer') {
        updateToAccountDropdown();
    }
});

    // Month navigation
    document.getElementById('prev-month').addEventListener('click', () => {
        currentMonth.setMonth(currentMonth.getMonth() - 1);
        renderTransactions();
    });

    document.getElementById('next-month').addEventListener('click', () => {
        currentMonth.setMonth(currentMonth.getMonth() + 1);
        renderTransactions();
    });

    // Add transaction
    document.getElementById('add-transaction-btn').addEventListener('click', () => {
        openTransactionModal();
    });

    // Transaction form type buttons
    // Transaction form type buttons
document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentTransactionType = this.dataset.type;

        const categoryGroup = document.getElementById('category-form-group');
        const toAccountGroup = document.getElementById('to-account-form-group');
        const categorySelect = document.getElementById('tx-category');
        const toAccountSelect = document.getElementById('tx-to-account');

        if (currentTransactionType === 'transfer') {
            categoryGroup.style.display = 'none';
            toAccountGroup.style.display = 'block';
            categorySelect.required = false;
            toAccountSelect.required = true;
            updateToAccountDropdown(); // We'll create this helper function next
        } else {
            categoryGroup.style.display = 'block';
            toAccountGroup.style.display = 'none';
            categorySelect.required = true;
            toAccountSelect.required = false;
            updateCategoryDropdown();
        }
    });
});

    // Recurring icon
    document.getElementById('recurring-icon').addEventListener('click', () => {
        const dropdown = document.getElementById('recurring-dropdown');
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });

    // Transaction form submit
    document.getElementById('transaction-form').addEventListener('submit', (e) => {
        e.preventDefault();
        saveTransaction();
    });

    // Add account
    document.getElementById('add-account-btn').addEventListener('click', () => {
        openAccountModal();
    });

    // Account form submit
    document.getElementById('account-form').addEventListener('submit', (e) => {
        e.preventDefault();
        saveAccount();
    });

    // Account type change shows credit card fields
    document.getElementById('acc-type').addEventListener('change', function() {
        const creditFields = document.getElementById('credit-card-fields');
        creditFields.style.display = this.value === 'Credit Card' ? 'block' : 'none';
    });

    // Modal close and cancel buttons (for transaction/account modals)
    document.querySelectorAll('#transaction-modal .close, #transaction-modal .cancel-btn, #account-modal .close, #account-modal .cancel-btn').forEach(btn => {
        btn.addEventListener('click', closeModals);
    });
     // Auth modal has its own close handlers in HTML, this is for other modals
    document.querySelector('#auth-modal .close').onclick = closeAuthModal;


    // Period selector in analytics
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            renderAnalytics();
        });
    });

    // Settings category add buttons
    document.getElementById('add-expense-category-btn').addEventListener('click', () => {
        const name = prompt('Enter category name:');
        if (name) {
            addCategory('expense', name);
        }
    });

    document.getElementById('add-income-category-btn').addEventListener('click', () => {
        const name = prompt('Enter category name:');
        if (name) {
            addCategory('income', name);
        }
    });

    document.getElementById('add-account-type-btn').addEventListener('click', () => {
        const name = prompt('Enter account type name:');
        if (name) {
            addAccountType(name);
        }
    });

    // Listener for dynamically created "Pay Now" buttons
    document.getElementById('accounts-list').addEventListener('click', function(e) {
        if (e.target && e.target.classList.contains('pay-now-btn')) {
            const cardId = e.target.dataset.cardId;
            const amount = e.target.dataset.amount;
            openPayCreditCardModal(cardId, parseFloat(amount));
        }
    });

    // Listener for the new payment form
    document.getElementById('payment-form').addEventListener('submit', (e) => {
        e.preventDefault();
        handleCreditCardPayment();
    });

    // Add listeners to close the new payment modal
    document.querySelectorAll('#payment-modal .close, #payment-modal .cancel-btn').forEach(btn => {
        btn.addEventListener('click', closeModals);
    });

    // Export and Clear data buttons
    document.getElementById('export-data-btn').addEventListener('click', exportData);
    document.getElementById('clear-data-btn').addEventListener('click', clearAllData);
}

// --- DATA MODIFICATION FUNCTIONS (NOW ASYNC) ---
async function saveTransaction() {
    const transaction = {
        id: generateId(),
        date: document.getElementById('tx-date').value,
        type: currentTransactionType,
        amount: parseFloat(document.getElementById('tx-amount').value),
        accountId: document.getElementById('tx-account').value, // From Account
        description: document.getElementById('tx-description').value,
        recurring: document.getElementById('tx-recurring').value
    };

    if (currentTransactionType === 'transfer') {
        transaction.toAccountId = document.getElementById('tx-to-account').value;
    } else {
        transaction.categoryId = document.getElementById('tx-category').value;
    }

    appData.transactions.push(transaction);
    await saveData();
    closeModals();
    renderTransactions();
}

async function saveAccount() {
    const account = {
        id: generateId(),
        name: document.getElementById('acc-name').value,
        type: document.getElementById('acc-type').value,
        balance: parseFloat(document.getElementById('acc-balance').value),
        includeInTotal: document.getElementById('acc-include').checked
    };
    if (account.type === 'Credit Card') {
        account.creditLimit = parseFloat(document.getElementById('acc-credit-limit').value) || 0;
        account.billingDay = parseInt(document.getElementById('acc-billing-day').value) || 1;
        account.paymentDay = parseInt(document.getElementById('acc-payment-day').value) || 1;
    }
    appData.accounts.push(account);
    await saveData();
    closeModals();
    renderAccounts();
}

// --- Add these new functions after saveAccount() ---

function openPayCreditCardModal(cardId, amount) {
    const card = getAccount(cardId);
    if (!card) return;

    document.getElementById('payment-modal').classList.add('show');
    document.getElementById('payment-card-id').value = cardId;
    document.getElementById('payment-amount-value').value = amount;
    document.getElementById('payment-amount').textContent = formatCurrency(amount);
    
    // Populate dropdown with accounts that can be used for payment
    const paymentAccountSelect = document.getElementById('payment-account');
    paymentAccountSelect.innerHTML = '<option value="">Select payment account</option>';
    appData.accounts.filter(acc => acc.type !== 'Credit Card').forEach(acc => {
        const option = document.createElement('option');
        option.value = acc.id;
        option.textContent = `${acc.name} (${formatCurrency(acc.balance)})`;
        paymentAccountSelect.appendChild(option);
    });
}

async function handleCreditCardPayment() {
    const fromAccountId = document.getElementById('payment-account').value;
    const toAccountId = document.getElementById('payment-card-id').value;
    const amount = parseFloat(document.getElementById('payment-amount-value').value);

    if (!fromAccountId || !toAccountId || !amount) {
        alert('Please select a payment account.');
        return;
    }

    const fromAccount = getAccount(fromAccountId);
    const toAccount = getAccount(toAccountId);

    if (fromAccount.balance < amount) {
        alert('Insufficient funds in the selected account.');
        return;
    }
    
    // 1. Create the transfer transaction
    const transaction = {
        id: generateId(),
        date: formatDate(new Date()),
        type: 'transfer',
        amount: amount,
        accountId: fromAccountId,
        toAccountId: toAccountId,
        description: `Payment for ${toAccount.name}`
    };
    appData.transactions.push(transaction);

    // 2. Manually update account balances
    fromAccount.balance -= amount;
    toAccount.balance += amount; // Increases balance (making it less negative)

    // 3. Save, close, and re-render
    await saveData();
    closeModals();
    renderAccounts(); // Re-render to show updated balances
}

async function addCategory(type, name) {
    const category = { id: generateId(), name: name, color: getRandomColor(), icon: getRandomIcon() };
    if (type === 'expense') {
        appData.expenseCategories.push(category);
    } else {
        appData.incomeCategories.push(category);
    }
    await saveData();
    renderSettings();
}

async function addAccountType(name) {
    const type = { id: generateId(), name: name, icon: getRandomIcon(), color: getRandomColor() };
    appData.accountTypes.push(type);
    await saveData();
    renderSettings();
}

async function clearAllData() {
    if (confirm('Are you sure you want to clear all your data? This cannot be undone.')) {
        appData = JSON.parse(JSON.stringify(defaultAppData)); // Reset in-memory data
        if (currentUser) {
            await saveDataToFirestore(); // Overwrite cloud data with empty state
        } else {
            localStorage.clear(); // Clear guest data
        }
        render(); // Re-render the empty UI
    }
}


// --- ALL RENDER AND UTILITY FUNCTIONS (MOSTLY UNCHANGED) ---

// Tab switching
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    document.getElementById(`${tab}-screen`).classList.add('active');

    if (tab === 'transactions') renderTransactions();
    else if (tab === 'analytics') renderAnalytics();
    else if (tab === 'accounts') renderAccounts();
    else if (tab === 'settings') renderSettings();
}

// Render all main data views
function render() {
    // Ensure data exists before rendering
    if (!appData.transactions) appData.transactions = [];
    if (!appData.accounts) appData.accounts = [];
    if (!appData.settings) appData.settings = { currency: '₹' };

    renderTransactions();
    renderAccounts();
    renderSettings();
    if(document.querySelector('.screen.active')?.id === 'analytics-screen') {
        renderAnalytics();
    }
}

// Render transactions grouped by day
function renderTransactions() {
    const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    document.getElementById('current-month').textContent = monthName;

    const monthTransactions = getMonthTransactions();
    const grouped = groupTransactionsByDay(monthTransactions);

    // Calculate monthly totals
    let totalIncome = 0, totalExpense = 0;
    monthTransactions.forEach(tx => {
        if (tx.type === 'income') totalIncome += tx.amount;
        if (tx.type === 'expense') totalExpense += tx.amount;
         if (tx.type === 'transfer') {
        const toAccount = getAccount(tx.toAccountId);
        const fromAccount = getAccount(tx.accountId);
        // Count as expense if money moves from an included account to an excluded one
        if (fromAccount && fromAccount.includeInTotal && toAccount && !toAccount.includeInTotal) {
            totalExpense += tx.amount;
        }
        // Count as income if money moves from an excluded account to an included one
        if (toAccount && toAccount.includeInTotal && fromAccount && !fromAccount.includeInTotal) {
            totalIncome += tx.amount;
        }
    }
    });

    document.getElementById('monthly-income').textContent = formatCurrency(totalIncome);
    document.getElementById('monthly-expense').textContent = formatCurrency(totalExpense);
    document.getElementById('monthly-net').textContent = formatCurrency(totalIncome - totalExpense);

    // Render grouped transactions
    const listEl = document.getElementById('transactions-list');
    listEl.innerHTML = '';

    if (Object.keys(grouped).length === 0) {
        listEl.innerHTML = '<div class="empty-state"><h3>No transactions this month</h3><p>Add your first transaction using the + button</p></div>';
        return;
    }

    // New code
    Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a)).forEach(date => {
        const dayGroup = document.createElement('div');
        dayGroup.className = 'day-group';

        // Set the date header
        const dateObj = new Date(date);
        const dayName = getDayName(dateObj);
        const header = document.createElement('div');
        header.className = 'day-header';
        header.textContent = dayName;
        dayGroup.appendChild(header);

        // --- START: Added Logic ---
        // Calculate totals for the day
        let dailyIncome = 0;
        let dailyExpense = 0;
        grouped[date].forEach(tx => {
            if (tx.type === 'income') dailyIncome += tx.amount;
            if (tx.type === 'expense') dailyExpense += tx.amount;
             if (tx.type === 'transfer') {
        const toAccount = getAccount(tx.toAccountId);
        const fromAccount = getAccount(tx.accountId);
        // Count as expense if money moves from an included account to an excluded one
        if (fromAccount && fromAccount.includeInTotal && toAccount && !toAccount.includeInTotal) {
            dailyExpense += tx.amount;
        }
         // Count as income if money moves from an excluded account to an included one
        if (toAccount && toAccount.includeInTotal && fromAccount && !fromAccount.includeInTotal) {
            dailyIncome += tx.amount;
        }
    }
        });

        // Create and append the summary element
        const summaryEl = document.createElement('div');
        summaryEl.className = 'day-summary';
        summaryEl.innerHTML = `
            <span class="income">In: ${formatCurrency(dailyIncome)}</span>
            <span class="expense">Out: ${formatCurrency(dailyExpense)}</span>
            <span class="net">Net: ${formatCurrency(dailyIncome - dailyExpense)}</span>
        `;
        dayGroup.appendChild(summaryEl);
        // --- END: Added Logic ---

        // Append the individual transaction items
        grouped[date].forEach(tx => {
            const item = createTransactionItem(tx);
            dayGroup.appendChild(item);
        });

        listEl.appendChild(dayGroup);
    });
}

function createTransactionItem(tx) {
    const category = getCategory(tx.categoryId, tx.type);
    const account = getAccount(tx.accountId);
    const item = document.createElement('div');
    item.className = 'transaction-item';
    item.innerHTML = `
        <div class="transaction-info">
            <div class="transaction-desc">${category?.icon || ''} ${tx.description || 'No description'}</div>
            <div class="transaction-meta">${category?.name || 'Uncategorized'} • ${account?.name || 'Unknown Account'}</div>
        </div>
        <div class="transaction-amount ${tx.type}">${formatCurrency(tx.amount)}</div>
    `;
    return item;
}

function renderAccounts() {
    let assets = 0;
    let liabilities = 0;

    // --- New, more accurate financial summary calculation ---
    appData.accounts.forEach(acc => {
        if (!acc.includeInTotal) return;

        if (acc.type !== 'Credit Card') {
            if (acc.balance >= 0) assets += acc.balance;
            else liabilities += Math.abs(acc.balance);
        } else {
            // For credit cards, only the "Balance Payable" contributes to liabilities
            const today = new Date();
            const billingDay = acc.billingDay || 15;
            let lastBillingDate = new Date(today.getFullYear(), today.getMonth(), billingDay);
            if (today.getDate() < billingDay) {
                lastBillingDate.setMonth(lastBillingDate.getMonth() - 1);
            }
            
            // Calculate outstanding charges (new expenses since last bill)
            let outstandingBalance = 0;
            appData.transactions.forEach(tx => {
                if (tx.accountId === acc.id && new Date(tx.date) > lastBillingDate) {
                    outstandingBalance -= tx.amount;
                }
            });

            // Balance Payable is the total balance MINUS the new charges.
            const balancePayable = acc.balance - outstandingBalance;
            
            if (acc.balance > 0) assets += acc.balance;
            if (balancePayable < 0) {
                 liabilities += Math.abs(balancePayable);
            }
        }
    });

    document.getElementById('total-assets').textContent = formatCurrency(assets);
    document.getElementById('total-liabilities').textContent = formatCurrency(liabilities);
    document.getElementById('net-worth').textContent = formatCurrency(assets - liabilities);

    // --- New Grouping and Rendering Logic ---
    const listEl = document.getElementById('accounts-list');
    listEl.innerHTML = '';

    const groupedAccounts = appData.accounts.reduce((groups, account) => {
        const type = account.type || 'Uncategorized';
        (groups[type] = groups[type] || []).push(account);
        return groups;
    }, {});

    Object.keys(groupedAccounts).forEach(type => {
        const accountsInGroup = groupedAccounts[type];
        const groupTotal = accountsInGroup.reduce((sum, acc) => sum + acc.balance, 0);

        const groupHeader = document.createElement('div');
        groupHeader.className = 'account-group-header';
        groupHeader.innerHTML = `<span class="group-name">${type}</span><span class="group-total">${formatCurrency(groupTotal)}</span>`;
        listEl.appendChild(groupHeader);

        accountsInGroup.forEach(acc => {
            const item = document.createElement('div');
            item.className = 'account-item';
            const balanceClass = acc.balance >= 0 ? 'positive' : 'negative';

            if (acc.type === 'Credit Card') {
                item.classList.add('credit-card');
                
                const today = new Date();
                const billingDay = acc.billingDay || 15;
                let lastBillingDate = new Date(today.getFullYear(), today.getMonth(), billingDay);
                if (today.getDate() < billingDay) {
                    lastBillingDate.setMonth(lastBillingDate.getMonth() - 1);
                }

                let outstandingBalance = 0;
                appData.transactions.forEach(tx => {
                    // Only count expenses on this card that are after the last billing date
                    if (tx.accountId === acc.id && tx.type === 'expense' && new Date(tx.date) > lastBillingDate) {
                        outstandingBalance -= tx.amount;
                    }
                });

                const balancePayable = acc.balance - outstandingBalance;

                item.innerHTML = `
                    <div class="account-info"><h3>${acc.name}</h3></div>
                    <div class="credit-card-details">
                        <div class="balance-line">
                            <span class="label">Balance Payable</span>
                            <span class="amount ${balancePayable <= 0 ? 'negative' : 'positive'}">${formatCurrency(balancePayable)}</span>
                        </div>
                        <div class="balance-line">
                            <span class="label">Outstanding Balance</span>
                            <span class="amount ${outstandingBalance <= 0 ? 'negative' : 'positive'}">${formatCurrency(outstandingBalance)}</span>
                        </div>
                    </div>
                    ${balancePayable < 0 ? `<button class="pay-now-btn" data-card-id="${acc.id}" data-amount="${Math.abs(balancePayable)}">Pay Now</button>` : ''}
                `;
            } else {
                item.innerHTML = `
                    <div class="account-info"><h3>${acc.name}</h3></div>
                    <div class="account-balance ${balanceClass}">${formatCurrency(acc.balance)}</div>
                `;
            }
            listEl.appendChild(item);
        });
    });
}

function renderAnalytics() {
    const period = document.querySelector('.period-btn.active').dataset.period;
    const transactions = getTransactionsByPeriod(period);
    let totalIncome = 0, totalExpense = 0;
    transactions.forEach(tx => {
        if (tx.type === 'income') totalIncome += tx.amount;
        if (tx.type === 'expense') totalExpense += tx.amount;
    });
    document.getElementById('analytics-income').textContent = formatCurrency(totalIncome);
    document.getElementById('analytics-expense').textContent = formatCurrency(totalExpense);
    document.getElementById('analytics-net').textContent = formatCurrency(totalIncome - totalExpense);
    renderCharts(transactions);
}

function renderCharts(transactions) {
    const expenses = transactions.filter(tx => tx.type === 'expense');
    const categoryData = {};
    expenses.forEach(tx => {
        const cat = getCategory(tx.categoryId, 'expense');
        if (cat) categoryData[cat.name] = (categoryData[cat.name] || 0) + tx.amount;
    });

    const pieCtx = document.getElementById('pie-chart');
    if (charts.pie) charts.pie.destroy();
    if(Object.keys(categoryData).length > 0){
        charts.pie = new Chart(pieCtx, {
            type: 'pie',
            data: {
                labels: Object.keys(categoryData),
                datasets: [{ data: Object.values(categoryData), backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'] }]
            },
            options: { responsive: true, maintainAspectRatio: true }
        });
    }


    const lineCtx = document.getElementById('line-chart');
    if (charts.line) charts.line.destroy();
    const last6Months = [], incomeData = [], expenseData = [];
    for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        last6Months.push(date.toLocaleDateString('en-US', { month: 'short' }));
        const monthTx = appData.transactions.filter(tx => {
            const txDate = new Date(tx.date);
            return txDate.getMonth() === date.getMonth() && txDate.getFullYear() === date.getFullYear();
        });
        let income = 0, expense = 0;
        monthTx.forEach(tx => {
            if (tx.type === 'income') income += tx.amount;
            if (tx.type === 'expense') expense += tx.amount;
        });
        incomeData.push(income);
        expenseData.push(expense);
    }
    charts.line = new Chart(lineCtx, {
        type: 'line',
        data: {
            labels: last6Months,
            datasets: [
                { label: 'Income', data: incomeData, borderColor: '#4CAF50', backgroundColor: 'rgba(76, 175, 80, 0.1)' },
                { label: 'Expenses', data: expenseData, borderColor: '#F44336', backgroundColor: 'rgba(244, 67, 54, 0.1)' }
            ]
        },
        options: { responsive: true, maintainAspectRatio: true }
    });
}

function renderSettings() {
    renderCategoriesList('expense');
    renderCategoriesList('income');
    renderAccountTypesList();
}

function renderCategoriesList(type) {
    const categories = type === 'expense' ? appData.expenseCategories : appData.incomeCategories;
    const listEl = document.getElementById(`${type}-categories-list`);
    listEl.innerHTML = '';
    categories.forEach(cat => {
        const tag = document.createElement('div');
        tag.className = 'category-tag';
        tag.style.backgroundColor = cat.color + '20';
        tag.style.color = cat.color;
        tag.textContent = `${cat.icon} ${cat.name}`;
        listEl.appendChild(tag);
    });
}

function renderAccountTypesList() {
    const listEl = document.getElementById('account-types-list');
    listEl.innerHTML = '';
    (appData.accountTypes || []).forEach(type => {
        const tag = document.createElement('div');
        tag.className = 'category-tag';
        tag.style.backgroundColor = type.color + '20';
        tag.style.color = type.color;
        tag.textContent = `${type.icon} ${type.name}`;
        listEl.appendChild(tag);
    });
}

function openTransactionModal() {
    document.getElementById('transaction-form').reset();
    document.getElementById('transaction-modal').classList.add('show');
    document.getElementById('tx-date').valueAsDate = new Date();
    updateAccountDropdown();
    updateCategoryDropdown();
}

function openAccountModal() {
    document.getElementById('account-form').reset();
    document.getElementById('account-modal').classList.add('show');
    updateAccountTypeDropdown();
}

function closeModals() {
    document.querySelectorAll('#transaction-modal, #account-modal, #payment-modal').forEach(modal => modal.classList.remove('show'));
    document.querySelectorAll('form').forEach(form => form.reset());
}

function updateAccountDropdown() {
    const select = document.getElementById('tx-account');
    select.innerHTML = '<option value="">Select account</option>';
    (appData.accounts || []).forEach(acc => {
        const option = document.createElement('option');
        option.value = acc.id;
        option.textContent = acc.name;
        select.appendChild(option);
    });
}



function updateCategoryDropdown() {
    const categories = currentTransactionType === 'income' ? appData.incomeCategories : appData.expenseCategories;
    const select = document.getElementById('tx-category');
    select.innerHTML = '<option value="">Select category</option>';
    (categories || []).forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = `${cat.icon} ${cat.name}`;
        select.appendChild(option);
    });
}

function updateToAccountDropdown() {
    const fromAccount = document.getElementById('tx-account').value;
    const select = document.getElementById('tx-to-account');
    select.innerHTML = '<option value="">Select account</option>';
    // Filter out the 'from' account so you can't transfer to itself
    (appData.accounts || []).filter(acc => acc.id !== fromAccount).forEach(acc => {
        const option = document.createElement('option');
        option.value = acc.id;
        option.textContent = acc.name;
        select.appendChild(option);
    });
}

function updateAccountTypeDropdown() {
    const select = document.getElementById('acc-type');
    select.innerHTML = '<option value="">Select type</option>';
    (appData.accountTypes || []).forEach(type => {
        const option = document.createElement('option');
        option.value = type.name;
        option.textContent = `${type.icon} ${type.name}`;
        select.appendChild(option);
    });
}

function generateId() { return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9); }
function formatDate(date) { return date.toISOString().split('T')[0]; }
function formatCurrency(amount) { return (appData.settings.currency || '₹') + (amount || 0).toLocaleString('en-IN'); }
function getAccount(id) { return (appData.accounts || []).find(acc => acc.id === id); }
function getCategory(id, type) { return (type === 'income' ? (appData.incomeCategories || []) : (appData.expenseCategories || [])).find(cat => cat.id === id); }
function getMonthTransactions() { return (appData.transactions || []).filter(tx => { const d = new Date(tx.date); return d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear(); }); }
function groupTransactionsByDay(transactions) { return (transactions || []).reduce((groups, tx) => { (groups[tx.date] = groups[tx.date] || []).push(tx); return groups; }, {}); }
function getDayName(date) {
    const today = new Date(); const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}
function getTransactionsByPeriod(period) {
    const now = new Date();
    return (appData.transactions || []).filter(tx => {
        const txDate = new Date(tx.date);
        switch (period) {
            case 'day': return txDate.toDateString() === now.toDateString();
            case 'week': const weekAgo = new Date(now.getTime() - 7 * 86400000); return txDate >= weekAgo;
            case 'month': return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
            case 'year': return txDate.getFullYear() === now.getFullYear();
            default: return true;
        }
    });
}
function getRandomColor() { return ['#F44336', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#2196F3', '#03A9F4', '#00BCD4', '#009688', '#4CAF50'][Math.floor(Math.random() * 10)]; }
function getRandomIcon() { return ['💰', '🏦', '💳', '💵', '📊', '📈', '🎯', '🎁', '🍔', '🚗'][Math.floor(Math.random() * 10)]; }
function exportData() {
    const dataStr = JSON.stringify(appData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'expense-tracker-data.json';
    link.click();
}
