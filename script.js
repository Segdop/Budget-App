let familyMembers = []; // Default
let incomes = {}; // Dynamic: { "Alex": 5000, "Sam": 2000, ... }
let expenses = [];
let goals = [];
let allocations = []; // non-goal allocations from disposable

// NEW: Investments
let investments = []; // [{ name, monthlyContribution, years, annualRate }]

let categoryChart = null;
let ownerChart = null;
let allocationChart = null; // Disposable allocation breakdown chart
let goalCharts = {}; // Chart per goal index

// NEW: Investment charts
let investmentCharts = {}; // Chart per investment index

let expenseListSortable = null;
let familyListSortable = null;

let editingFamilyIndex = null;

// Goal editing state
let editingGoalIndex = null;
let goalEditDrafts = {};
let lastDisposable = 0;

// Investment editing state
let editingInvestmentIndex = null;
let investmentEditDrafts = {};

// ────────────────────────────────────────────────────
// Load / Save
// ────────────────────────────────────────────────────
function loadData() {
    loadFamilyMembers();

    const savedIncomes = JSON.parse(localStorage.getItem('incomes'));
    const savedExpenses = JSON.parse(localStorage.getItem('expenses'));
    const savedGoals = JSON.parse(localStorage.getItem('goals'));
    const savedAllocations = JSON.parse(localStorage.getItem('allocations'));

    // NEW: investments
    const savedInvestments = JSON.parse(localStorage.getItem('investments'));

    if (savedIncomes) incomes = savedIncomes;
    if (savedExpenses) expenses = savedExpenses;
    if (savedGoals) goals = savedGoals;
    if (savedAllocations) allocations = savedAllocations;
    if (savedInvestments) investments = savedInvestments;

    // Backward-compat: migrate {user, wife} -> {"You","Wife"}
    if (
        incomes &&
        typeof incomes === 'object' &&
        !Array.isArray(incomes) &&
        ('user' in incomes || 'wife' in incomes)
    ) {
        const migrated = {};
        migrated["You"] = Number(incomes.user) || 0;
        migrated["Wife"] = Number(incomes.wife) || 0;
        incomes = migrated;
    }

    if (!Array.isArray(expenses)) expenses = [];
    if (!Array.isArray(goals)) goals = [];
    if (!Array.isArray(allocations)) allocations = [];
    if (!Array.isArray(investments)) investments = [];

    // Normalize investment objects (safe defaults)
    investments = investments.map(inv => ({
        name: String(inv?.name ?? '').trim(),
        monthlyContribution: Number(inv?.monthlyContribution) || 0,
        years: Math.max(0, parseInt(inv?.years, 10) || 0),
        annualRate: Number(inv?.annualRate) || 0
    })).filter(inv => inv.name);

    normalizeIncomes();
    migrateGoalsToAllocated();

    editingFamilyIndex = null;
    editingGoalIndex = null;
    goalEditDrafts = {};
    editingInvestmentIndex = null;
    investmentEditDrafts = {};

    updateFamilyList();
    renderIncomeInputs();
    updateOwnerDropdowns();
    updateDisplay();
}

function saveData() {
    localStorage.setItem('incomes', JSON.stringify(incomes));
    localStorage.setItem('expenses', JSON.stringify(expenses));
    localStorage.setItem('goals', JSON.stringify(goals));
    localStorage.setItem('allocations', JSON.stringify(allocations));

    // NEW: investments
    localStorage.setItem('investments', JSON.stringify(investments));
}

// ────────────────────────────────────────────────────
// Data Export / Import (for backups + moving between file:// and Live Server)
// ────────────────────────────────────────────────────
function buildAppDataSnapshot() {
    return {
        familyMembers,
        incomes,
        expenses,
        goals,
        allocations,
        investments,
        exportedAt: new Date().toISOString(),
        app: 'budget-app'
    };
}

function exportAppDataToFile() {
    try {
        const snapshot = buildAppDataSnapshot();
        const json = JSON.stringify(snapshot, null, 2);
        const blob = new Blob([json], { type: 'application/json' });

        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const filename = `budget-app-backup-${y}-${m}-${d}.json`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error(err);
        alert('Export failed. Check the console for details.');
    }
}

function importAppDataFromObject(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('Invalid JSON.');

    // Accept either full snapshot OR raw storage-shaped object
    const hasSnapshotShape = (
        'familyMembers' in obj || 'incomes' in obj || 'expenses' in obj || 'goals' in obj || 'allocations' in obj || 'investments' in obj
    );

    if (!hasSnapshotShape) throw new Error('JSON does not look like a budget app export.');

    // Write to localStorage in the exact format the app expects
    if (obj.familyMembers) localStorage.setItem('familyMembers', JSON.stringify(obj.familyMembers));
    if (obj.incomes) localStorage.setItem('incomes', JSON.stringify(obj.incomes));
    if (obj.expenses) localStorage.setItem('expenses', JSON.stringify(obj.expenses));
    if (obj.goals) localStorage.setItem('goals', JSON.stringify(obj.goals));
    if (obj.allocations) localStorage.setItem('allocations', JSON.stringify(obj.allocations));
    if (obj.investments) localStorage.setItem('investments', JSON.stringify(obj.investments));

    // Reload app state
    loadData();
}

function importAppDataFromFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const obj = JSON.parse(String(reader.result || ''));
            importAppDataFromObject(obj);
            alert('Import complete.');
        } catch (err) {
            console.error(err);
            alert('Import failed. Make sure you selected a valid exported JSON file.');
        }
    };
    reader.onerror = () => {
        alert('Import failed reading the file.');
    };
    reader.readAsText(file);
}

function loadFamilyMembers() {
    const saved = localStorage.getItem('familyMembers');
    if (saved) {
        familyMembers = JSON.parse(saved);
    }

    if (!Array.isArray(familyMembers)) {
        familyMembers = [];
    }
}

function saveFamilyMembers() {
    localStorage.setItem('familyMembers', JSON.stringify(familyMembers));
}

// Ensure incomes has exactly the current family member keys, all numeric
function normalizeIncomes() {
    if (!incomes || typeof incomes !== 'object' || Array.isArray(incomes)) incomes = {};

    familyMembers.forEach(member => {
        const val = Number(incomes[member]);
        incomes[member] = Number.isFinite(val) ? val : 0;
    });

    Object.keys(incomes).forEach(key => {
        if (!familyMembers.includes(key)) delete incomes[key];
    });

    saveData();
}

// Ensure goals have alloc fields + autoAlloc flag (default true to support target-based auto)
function migrateGoalsToAllocated() {
    const now = new Date();

    goals = goals.map(g => {
        const goal = { ...g };

        if (goal.alreadySaved == null) goal.alreadySaved = 0;

        // default auto allocation ON if not present
        if (goal.autoAlloc == null) goal.autoAlloc = true;

        const hasMode = goal.allocMode === 'percent' || goal.allocMode === 'fixed';
        const hasValue = Number.isFinite(Number(goal.allocValue));

        if (!hasMode || !hasValue) {
            goal.allocMode = 'fixed';

            let monthlyNeeded = 0;
            const amount = Number(goal.amount) || 0;
            const already = Number(goal.alreadySaved) || 0;
            const remaining = Math.max(0, amount - already);

            if (goal.targetDate) {
                const target = new Date(goal.targetDate);
                const months = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
                monthlyNeeded = months > 0 ? (remaining / months) : remaining;
            } else {
                monthlyNeeded = remaining;
            }

            goal.allocValue = Number.isFinite(monthlyNeeded) ? Number(monthlyNeeded.toFixed(2)) : 0;
        } else {
            goal.allocValue = Number(goal.allocValue) || 0;
        }

        return goal;
    });

    saveData();
}

// ────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────
function dollarsFromMode(mode, value, disposable) {
    const v = Number(value) || 0;
    if (mode === 'percent') return Math.max(0, disposable * (v / 100));
    return Math.max(0, v);
}

function percentOfDisposable(dollars, disposable) {
    if (!disposable || disposable === 0) return 0;
    return (dollars / disposable) * 100;
}

function computeGoalMonthlyContribution(goal, disposable) {
    return dollarsFromMode(goal.allocMode, goal.allocValue, disposable);
}

function computeAllocationMonthly(a, disposable) {
    return dollarsFromMode(a.mode, a.value, disposable);
}

function formatMoney(n) {
    return Number(n || 0).toFixed(2);
}

function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

function colorForIndex(i) {
    const hue = (i * 57) % 360;
    return `hsl(${hue} 70% 60%)`;
}

function scrollAndHighlight(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('highlight');
    setTimeout(() => el.classList.remove('highlight'), 1500);
}

/**
 * NEW: commit edits without rerendering per keystroke.
 * Enter triggers blur, blur triggers 'change', and then we rerender once.
 */
function commitOnEnter(inputEl) {
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            inputEl.blur();
        }
    });
}

// ────────────────────────────────────────────────────
// Target-based goal planning helpers
// ────────────────────────────────────────────────────
function daysInMonth(year, monthIndex0to11) {
    return new Date(year, monthIndex0to11 + 1, 0).getDate();
}

function addMonthsPreserveDay(date, months) {
    const d = new Date(date);
    const day = d.getDate();

    let year = d.getFullYear();
    let month = d.getMonth() + months;

    year += Math.floor(month / 12);
    month = ((month % 12) + 12) % 12;

    const dim = daysInMonth(year, month);
    return new Date(year, month, Math.min(day, dim), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

/**
 * Returns the maximum whole number of months m such that now + m months <= target.
 * Always returns at least 1.
 */
function monthsAvailableUntilTarget(targetDateStr) {
    const now = new Date();
    const target = new Date(targetDateStr);

    if (!targetDateStr || Number.isNaN(target.getTime())) return 1;
    if (target <= now) return 1;

    let m = 0;
    while (m < 600) {
        const next = addMonthsPreserveDay(now, m + 1);
        if (next <= target) m++;
        else break;
    }

    return Math.max(1, m);
}

function computeGoalTargetPlan(goal, disposable) {
    const amount = Number(goal.amount) || 0;
    const already = Number(goal.alreadySaved) || 0;
    const remaining = Math.max(0, amount - already);

    const monthsAvail = monthsAvailableUntilTarget(goal.targetDate);
    const requiredMonthly = monthsAvail > 0 ? (remaining / monthsAvail) : remaining;

    const requiredPercent = disposable > 0 ? (requiredMonthly / disposable) * 100 : null;

    return { remaining, monthsAvail, requiredMonthly, requiredPercent };
}

/**
 * Implements your choice (1): recommended allocation uses the CURRENT mode.
 */
function recommendedAllocValueForMode(goal, disposable) {
    const plan = computeGoalTargetPlan(goal, disposable);

    if (goal.allocMode === 'fixed') {
        return { value: plan.requiredMonthly, plan, ok: true };
    }

    // percent mode
    if (plan.requiredPercent == null) {
        return { value: null, plan, ok: false };
    }

    return { value: plan.requiredPercent, plan, ok: true };
}

// ────────────────────────────────────────────────────
// NEW: Investment math helpers
// ────────────────────────────────────────────────────
function monthsRemainingThisYear() {
    const now = new Date();
    return 12 - now.getMonth(); // includes current month
}

function projectInvestmentSeries(inv) {
    const months = Math.max(0, parseInt(inv.years, 10) || 0) * 12;
    const monthly = Number(inv.monthlyContribution) || 0;
    const r = (Number(inv.annualRate) || 0) / 100 / 12;

    let contributed = 0;
    let balance = 0;

    const labels = [];
    const contribLine = [];
    const growthLine = [];

    for (let m = 1; m <= months; m++) {
        contributed += monthly;
        balance = (balance + monthly) * (1 + r);

        if (m % 12 === 0 || m === months) {
            const yearNum = Math.ceil(m / 12);
            labels.push(`Year ${yearNum}`);
            contribLine.push(round2(contributed));
            growthLine.push(round2(balance));
        }
    }

    return { labels, contribLine, growthLine };
}

function projectInvestmentForYear(inv) {
    const maxMonths = (Math.max(0, parseInt(inv.years, 10) || 0) * 12);
    const monthsThisYear = Math.min(monthsRemainingThisYear(), maxMonths);

    const monthly = Number(inv.monthlyContribution) || 0;
    const r = (Number(inv.annualRate) || 0) / 100 / 12;

    let contributed = 0;
    let balance = 0;

    for (let m = 1; m <= monthsThisYear; m++) {
        contributed += monthly;
        balance = (balance + monthly) * (1 + r);
    }

    const endValue = round2(balance);
    const contrib = round2(contributed);
    return {
        contributed: contrib,
        endValue,
        gain: round2(endValue - contrib)
    };
}

function updateInvestmentChart(index, inv) {
    const canvas = document.getElementById(`investment-chart-${index}`);
    if (!canvas) return;

    const { labels, contribLine, growthLine } = projectInvestmentSeries(inv);

    if (investmentCharts[index]) {
        try { investmentCharts[index].destroy(); } catch (_) { }
        delete investmentCharts[index];
    }

    investmentCharts[index] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Total Contributed',
                    data: contribLine,
                    borderColor: '#9e9e9e',
                    borderDash: [6, 5],
                    fill: false,
                    tension: 0.1
                },
                {
                    label: 'Projected Value',
                    data: growthLine,
                    borderColor: '#4CAF50',
                    backgroundColor: 'rgba(76, 175, 80, 0.2)',
                    fill: true,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `$${Number(ctx.raw || 0).toFixed(2)}`
                    }
                }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

// ────────────────────────────────────────────────────
// Family Members
// ────────────────────────────────────────────────────
function addFamilyMember() {
    const nameInput = document.getElementById('new-member-name');
    const name = nameInput.value.trim();

    if (name && !familyMembers.includes(name)) {
        familyMembers.push(name);
        incomes[name] = 0;

        saveFamilyMembers();
        saveData();

        nameInput.value = '';
        updateFamilyList();
        renderIncomeInputs();
        updateOwnerDropdowns();
        updateDisplay();
    }
}

function removeFamilyMember(index) {
    const memberName = familyMembers[index];
    if (!memberName) return;

    if (confirm(`Remove ${memberName}? (Any expenses assigned to them will be reassigned to "Household".)`)) {
        expenses = expenses.map(exp =>
            exp.owner === memberName ? { ...exp, owner: "Household" } : exp
        );

        delete incomes[memberName];
        familyMembers.splice(index, 1);

        saveFamilyMembers();
        saveData();

        editingFamilyIndex = null;
        if (familyListSortable) familyListSortable.option('disabled', false);

        updateFamilyList();
        renderIncomeInputs();
        updateOwnerDropdowns();
        updateDisplay();
    }
}

function startEditFamilyMember(index) {
    if (index < 0 || index >= familyMembers.length) return;

    editingFamilyIndex = index;
    if (familyListSortable) familyListSortable.option('disabled', true);

    updateFamilyList();

    setTimeout(() => {
        const input = document.getElementById(`edit-member-name-${index}`);
        if (input) {
            input.focus();
            input.select();
        }
    }, 0);
}

function cancelEditFamilyMember() {
    editingFamilyIndex = null;
    if (familyListSortable) familyListSortable.option('disabled', false);
    updateFamilyList();
}

function saveEditFamilyMember(index) {
    const input = document.getElementById(`edit-member-name-${index}`);
    if (!input) return;

    const newName = input.value.trim();
    const oldName = familyMembers[index];

    if (!newName) return alert('Name cannot be empty.');
    if (newName !== oldName && familyMembers.includes(newName)) return alert('That name already exists. Choose a different name.');

    const oldIncome = Number(incomes[oldName]) || 0;
    delete incomes[oldName];
    incomes[newName] = oldIncome;

    familyMembers[index] = newName;

    expenses = expenses.map(exp =>
        exp.owner === oldName ? { ...exp, owner: newName } : exp
    );

    saveFamilyMembers();
    saveData();

    editingFamilyIndex = null;
    if (familyListSortable) familyListSortable.option('disabled', false);

    updateFamilyList();
    renderIncomeInputs();
    updateOwnerDropdowns();
    updateDisplay();
}

function updateFamilyList() {
    const list = document.getElementById('family-list');
    list.innerHTML = '';

    familyMembers.forEach((member, i) => {
        const li = document.createElement('li');

        if (editingFamilyIndex === i) {
            li.classList.add('editing');
            li.innerHTML = `
                <input type="text" id="edit-member-name-${i}" value="${member}">
                <div class="family-actions">
                    <button class="save-btn" onclick="saveEditFamilyMember(${i})">Save</button>
                    <button class="cancel-btn" onclick="cancelEditFamilyMember()">Cancel</button>
                </div>
            `;
        } else {
            li.innerHTML = `
                <span>${member}</span>
                <div class="family-actions">
                    <button class="edit-btn" onclick="startEditFamilyMember(${i})">Edit</button>
                    <button class="delete-btn" onclick="removeFamilyMember(${i})">Remove</button>
                </div>
            `;
        }

        list.appendChild(li);
    });

    if (!familyListSortable) {
        familyListSortable = Sortable.create(list, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            onEnd: (evt) => {
                if (editingFamilyIndex !== null) return;

                if (evt.oldIndex !== evt.newIndex) {
                    const [moved] = familyMembers.splice(evt.oldIndex, 1);
                    familyMembers.splice(evt.newIndex, 0, moved);

                    saveFamilyMembers();

                    renderIncomeInputs();
                    updateFamilyList();
                    updateOwnerDropdowns();
                }
            }
        });
    }
}

// ────────────────────────────────────────────────────
// Dynamic Incomes UI
// ────────────────────────────────────────────────────
function renderIncomeInputs() {
    const container = document.getElementById('income-inputs');
    if (!container) return;

    normalizeIncomes();
    container.innerHTML = '';

    familyMembers.forEach(member => {
        const row = document.createElement('div');
        row.className = 'income-row';

        const label = document.createElement('label');
        label.textContent = `${member}'s Monthly Income:`;

        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.01';
        input.min = '0';
        input.value = String(Number(incomes[member]) || 0);

        input.addEventListener('input', () => {
            incomes[member] = parseFloat(input.value) || 0;
            saveData();
            updateDisplay();
        });

        label.appendChild(input);
        row.appendChild(label);
        container.appendChild(row);
    });
}

// ────────────────────────────────────────────────────
// Expenses
// ────────────────────────────────────────────────────
function updateOwnerDropdowns() {
    const selects = document.querySelectorAll('#expense-owner, [id^="edit-owner-"]');
    selects.forEach(select => {
        const current = select.value;

        select.innerHTML =
            '<option value="">For whom?</option>' +
            '<option value="Household">Household (shared)</option>';

        familyMembers.forEach(member => {
            const opt = document.createElement('option');
            opt.value = member;
            opt.textContent = member + ' (personal)';
            select.appendChild(opt);
        });

        if (current) select.value = current;
    });
}

function addExpense() {
    const desc = document.getElementById('expense-desc')?.value.trim() || '';
    const amount = parseFloat(document.getElementById('expense-amount')?.value);
    const category = document.getElementById('expense-category')?.value || '';
    const owner = document.getElementById('expense-owner')?.value || '';

    if (!desc || isNaN(amount) || amount <= 0 || !category || !owner) {
        alert('Please fill all expense fields.');
        return;
    }

    expenses.push({ desc, amount, category, owner });

    document.getElementById('expense-desc').value = '';
    document.getElementById('expense-amount').value = '';
    document.getElementById('expense-category').value = '';
    document.getElementById('expense-owner').value = '';

    saveData();
    updateDisplay();
}

function startEditExpense(index) {
    updateDisplay();

    const row = document.querySelector(`tr[data-index="${index}"]`);
    if (!row) return;

    row.classList.add('editing');

    const cells = row.children;
    cells[0].innerHTML = `<input type="text" value="${expenses[index].desc}" id="edit-desc-${index}">`;
    cells[1].innerHTML = `<input type="number" step="0.01" value="${expenses[index].amount}" id="edit-amount-${index}">`;
    cells[2].innerHTML = `
        <select id="edit-category-${index}">
            <option value="Bills" ${expenses[index].category === 'Bills' ? 'selected' : ''}>Bills</option>
            <option value="Subscriptions" ${expenses[index].category === 'Subscriptions' ? 'selected' : ''}>Subscriptions</option>
            <option value="Necessities" ${expenses[index].category === 'Necessities' ? 'selected' : ''}>Necessities</option>
            <option value="Other" ${expenses[index].category === 'Other' ? 'selected' : ''}>Other</option>
        </select>`;
    cells[3].innerHTML = `
        <select id="edit-owner-${index}">
            <option value="Household" ${expenses[index].owner === 'Household' ? 'selected' : ''}>Household (shared)</option>
        </select>`;
    cells[4].innerHTML = `
        <button class="save-btn" onclick="saveEditExpense(${index})">Save</button>
        <button class="cancel-btn" onclick="cancelEdit()">Cancel</button>
    `;

    updateOwnerDropdowns();
}

function saveEditExpense(index) {
    const newDesc = document.getElementById(`edit-desc-${index}`)?.value.trim() || '';
    const newAmount = parseFloat(document.getElementById(`edit-amount-${index}`)?.value);
    const newCategory = document.getElementById(`edit-category-${index}`)?.value || '';
    const newOwner = document.getElementById(`edit-owner-${index}`)?.value || '';

    if (!newDesc || isNaN(newAmount) || newAmount <= 0 || !newCategory || !newOwner) {
        alert('Please fill all fields correctly.');
        return;
    }

    expenses[index] = { desc: newDesc, amount: newAmount, category: newCategory, owner: newOwner };
    saveData();
    updateDisplay();
}

function removeExpense(index) {
    if (confirm('Delete this expense?')) {
        expenses.splice(index, 1);
        saveData();
        updateDisplay();
    }
}

function cancelEdit() {
    updateDisplay();
}

// ────────────────────────────────────────────────────
// Allocations (non-goal buckets)
// ────────────────────────────────────────────────────
function addAllocation() {
    const name = document.getElementById('alloc-name')?.value.trim() || '';
    const mode = document.getElementById('alloc-mode')?.value || 'percent';
    const value = parseFloat(document.getElementById('alloc-value')?.value);

    if (!name || !Number.isFinite(value) || value < 0) {
        alert('Please provide an allocation name and a value (>= 0).');
        return;
    }

    allocations.push({ name, mode, value });

    document.getElementById('alloc-name').value = '';
    document.getElementById('alloc-mode').value = 'percent';
    document.getElementById('alloc-value').value = '';

    saveData();
    updateDisplay();
}

function removeAllocation(index) {
    if (confirm('Delete this allocation?')) {
        allocations.splice(index, 1);
        saveData();
        updateDisplay();
    }
}

// ────────────────────────────────────────────────────
// Goals
// ────────────────────────────────────────────────────
function addGoal() {
    const name = document.getElementById('goal-name')?.value.trim() || '';
    const amount = parseFloat(document.getElementById('goal-amount')?.value);
    const alreadySaved = parseFloat(document.getElementById('goal-already-saved')?.value) || 0;
    const targetDateStr = document.getElementById('goal-target-date')?.value;

    const allocMode = document.getElementById('goal-alloc-mode')?.value || 'percent';
    const allocValue = parseFloat(document.getElementById('goal-alloc-value')?.value);

    if (!name || isNaN(amount) || amount <= 0 || alreadySaved < 0 || !targetDateStr) {
        alert('Please fill goal name, amount (>0), already saved (>=0), and target date.');
        return;
    }
    if (alreadySaved > amount) {
        alert('Already Saved cannot be greater than Total Amount Needed.');
        return;
    }
    if (!Number.isFinite(allocValue) || allocValue < 0) {
        alert('Please provide an allocation value for the goal (>= 0).');
        return;
    }

    goals.push({
        name,
        amount,
        alreadySaved,
        targetDate: targetDateStr,
        allocMode,
        allocValue,
        autoAlloc: true
    });

    document.getElementById('goal-name').value = '';
    document.getElementById('goal-amount').value = '';
    document.getElementById('goal-already-saved').value = '';
    document.getElementById('goal-target-date').value = '';
    document.getElementById('goal-alloc-mode').value = 'percent';
    document.getElementById('goal-alloc-value').value = '';
    const recEl = document.getElementById('new-goal-recommended');
    if (recEl) recEl.textContent = '';

    saveData();
    updateDisplay();
}

function removeGoal(index) {
    if (confirm('Delete this goal?')) {
        goals.splice(index, 1);

        if (editingGoalIndex === index) {
            editingGoalIndex = null;
            delete goalEditDrafts[index];
        } else if (editingGoalIndex !== null && editingGoalIndex > index) {
            editingGoalIndex -= 1;
        }

        saveData();
        updateDisplay();
    }
}

function startEditGoal(index) {
    if (index < 0 || index >= goals.length) return;

    editingGoalIndex = index;

    goalEditDrafts[index] = {
        name: goals[index].name,
        amount: Number(goals[index].amount) || 0,
        alreadySaved: Number(goals[index].alreadySaved) || 0,
        targetDate: goals[index].targetDate || '',
        allocMode: goals[index].allocMode || 'percent',
        allocValue: Number(goals[index].allocValue) || 0,
        autoAlloc: goals[index].autoAlloc ?? true
    };

    updateDisplay();

    setTimeout(() => {
        const input = document.getElementById(`goal-edit-name-${index}`);
        if (input) {
            input.focus();
            input.select();
        }
    }, 0);
}

function cancelEditGoal(index) {
    delete goalEditDrafts[index];
    editingGoalIndex = null;
    updateDisplay();
}

function saveEditGoal(index) {
    const draft = goalEditDrafts[index];
    if (!draft) return;

    const name = document.getElementById(`goal-edit-name-${index}`)?.value.trim() ?? draft.name;
    const amount = parseFloat(document.getElementById(`goal-edit-amount-${index}`)?.value ?? draft.amount);
    const alreadySaved = parseFloat(document.getElementById(`goal-edit-already-${index}`)?.value ?? draft.alreadySaved) || 0;
    const targetDate = document.getElementById(`goal-edit-target-${index}`)?.value ?? draft.targetDate;
    const allocMode = document.getElementById(`goal-edit-alloc-mode-${index}`)?.value ?? draft.allocMode;
    const allocValue = parseFloat(document.getElementById(`goal-edit-alloc-value-${index}`)?.value ?? draft.allocValue);

    if (!name) return alert('Goal name cannot be empty.');
    if (!Number.isFinite(amount) || amount <= 0) return alert('Total Amount Needed must be > 0.');
    if (!Number.isFinite(alreadySaved) || alreadySaved < 0) return alert('Already Saved must be >= 0.');
    if (alreadySaved > amount) return alert('Already Saved cannot be greater than Total Amount Needed.');
    if (!targetDate) return alert('Target Date is required.');
    if (!(allocMode === 'percent' || allocMode === 'fixed')) return alert('Invalid allocation type.');
    if (!Number.isFinite(allocValue) || allocValue < 0) return alert('Allocation value must be >= 0.');

    goals[index] = {
        name,
        amount,
        alreadySaved,
        targetDate,
        allocMode,
        allocValue,
        autoAlloc: draft.autoAlloc ?? true
    };

    delete goalEditDrafts[index];
    editingGoalIndex = null;

    saveData();
    updateDisplay();
}

// Reset allocValue to target-required amount for the CURRENT mode
function resetGoalAllocation(index) {
    const disposable = lastDisposable;

    if (editingGoalIndex === index && goalEditDrafts[index]) {
        const draft = goalEditDrafts[index];
        const rec = recommendedAllocValueForMode(draft, disposable);

        if (!rec.ok) {
            alert('Cannot compute a % allocation because disposable income is 0 or negative. Switch to Fixed $/month or increase disposable.');
            return;
        }

        draft.autoAlloc = true;
        draft.allocValue = round2(rec.value);

        updateDisplay();
        return;
    }

    const goal = goals[index];
    if (!goal) return;

    const rec = recommendedAllocValueForMode(goal, disposable);
    if (!rec.ok) {
        alert('Cannot compute a % allocation because disposable income is 0 or negative. Switch to Fixed $/month or increase disposable.');
        return;
    }

    goal.autoAlloc = true;
    goal.allocValue = round2(rec.value);

    saveData();
    updateDisplay();
}

function recalcGoalPreview(index) {
    const draft = goalEditDrafts[index];
    if (!draft) return;

    if (draft.autoAlloc) {
        const rec = recommendedAllocValueForMode(draft, lastDisposable);
        if (rec.ok) {
            draft.allocValue = round2(rec.value);
            const valEl = document.getElementById(`goal-edit-alloc-value-${index}`);
            if (valEl) valEl.value = String(draft.allocValue);
        }
    }

    const monthly = computeGoalMonthlyContribution(draft, lastDisposable);
    const pct = percentOfDisposable(monthly, lastDisposable);

    const statusEl = document.getElementById(`goal-status-${index}`);
    if (statusEl) {
        statusEl.textContent = `Using $${formatMoney(monthly)} / mo (${pct.toFixed(2)}% of disposable).`;
    }

    updateGoalChart(index, monthly, draft, !draft.autoAlloc);
}

// ────────────────────────────────────────────────────
// NEW: Investments UI
// ────────────────────────────────────────────────────
function addInvestment() {
    const name = document.getElementById('inv-name')?.value.trim() || '';
    const monthlyContribution = parseFloat(document.getElementById('inv-monthly')?.value);
    const years = parseInt(document.getElementById('inv-years')?.value, 10);
    const annualRate = parseFloat(document.getElementById('inv-rate')?.value);

    if (!name || !Number.isFinite(monthlyContribution) || monthlyContribution <= 0 || !Number.isFinite(years) || years <= 0 || !Number.isFinite(annualRate) || annualRate < 0) {
        alert('Please fill investment name, monthly contribution (>0), years (>0), and estimated annual return (>=0).');
        return;
    }

    investments.push({ name, monthlyContribution, years, annualRate });

    document.getElementById('inv-name').value = '';
    document.getElementById('inv-monthly').value = '';
    document.getElementById('inv-years').value = '';
    document.getElementById('inv-rate').value = '';

    saveData();
    updateDisplay();
}

function startEditInvestment(index) {
    if (index < 0 || index >= investments.length) return;
    editingInvestmentIndex = index;
    investmentEditDrafts[index] = { ...investments[index] };
    updateDisplay();

    setTimeout(() => {
        const input = document.getElementById(`inv-edit-name-${index}`);
        if (input) { input.focus(); input.select(); }
    }, 0);
}

function cancelEditInvestment() {
    editingInvestmentIndex = null;
    investmentEditDrafts = {};
    updateDisplay();
}

function saveEditInvestment(index) {
    const d = investmentEditDrafts[index];
    if (!d) return;

    const name = String(d.name || '').trim();
    const monthlyContribution = Number(d.monthlyContribution) || 0;
    const years = Math.max(0, parseInt(d.years, 10) || 0);
    const annualRate = Number(d.annualRate) || 0;

    if (!name) return alert('Investment name cannot be empty.');
    if (!Number.isFinite(monthlyContribution) || monthlyContribution <= 0) return alert('Monthly contribution must be > 0.');
    if (!Number.isFinite(years) || years <= 0) return alert('Years must be > 0.');
    if (!Number.isFinite(annualRate) || annualRate < 0) return alert('Estimated annual return must be >= 0.');

    investments[index] = { name, monthlyContribution, years, annualRate };

    editingInvestmentIndex = null;
    investmentEditDrafts = {};

    saveData();
    updateDisplay();
}

function removeInvestment(index) {
    if (confirm('Delete this investment?')) {
        investments.splice(index, 1);

        if (editingInvestmentIndex === index) {
            editingInvestmentIndex = null;
            delete investmentEditDrafts[index];
        } else if (editingInvestmentIndex !== null && editingInvestmentIndex > index) {
            editingInvestmentIndex -= 1;
        }

        saveData();
        updateDisplay();
    }
}

// ────────────────────────────────────────────────────
// Chart helpers (expenses)
// ────────────────────────────────────────────────────
function getCategoryTotals() {
    const totals = { Bills: 0, Subscriptions: 0, Necessities: 0, Other: 0 };
    expenses.forEach(exp => {
        if (totals[exp.category] !== undefined) totals[exp.category] += Number(exp.amount) || 0;
    });
    return {
        labels: ['Bills', 'Subscriptions', 'Necessities', 'Other'],
        data: Object.values(totals),
        backgroundColor: ['#ff6384', '#36a2eb', '#4bc0c0', '#9966ff']
    };
}

function getOwnerTotals() {
    const totals = { Household: 0 };
    familyMembers.forEach(member => totals[member] = 0);

    expenses.forEach(exp => {
        if (totals[exp.owner] !== undefined) totals[exp.owner] += Number(exp.amount) || 0;
    });

    const labels = Object.keys(totals);
    const data = Object.values(totals);
    const backgroundColor = labels.map((_, i) => colorForIndex(i));

    return { labels, data, backgroundColor };
}

// ────────────────────────────────────────────────────
// Expense charts
// ────────────────────────────────────────────────────
function updateCharts() {
    const categoryData = getCategoryTotals();
    const categoryCanvas = document.getElementById('categoryPieChart');

    if (categoryCanvas) {
        if (categoryChart) categoryChart.destroy();
        categoryChart = new Chart(categoryCanvas.getContext('2d'), {
            type: 'pie',
            data: {
                labels: categoryData.labels,
                datasets: [{
                    data: categoryData.data,
                    backgroundColor: categoryData.backgroundColor
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }

    const ownerData = getOwnerTotals();
    const ownerCanvas = document.getElementById('ownerPieChart');

    if (ownerCanvas) {
        if (ownerChart) ownerChart.destroy();
        ownerChart = new Chart(ownerCanvas.getContext('2d'), {
            type: 'pie',
            data: {
                labels: ownerData.labels,
                datasets: [{
                    data: ownerData.data,
                    backgroundColor: ownerData.backgroundColor
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }
}

// ────────────────────────────────────────────────────
// Allocation donut chart (clickable)
// ────────────────────────────────────────────────────
function updateAllocationChart(disposable, goalItems, investmentItems, allocationItems) {
    const canvas = document.getElementById('allocationChart');
    if (!canvas) return;

    const noteEl = document.getElementById('allocation-chart-note');

    const items = [
        ...goalItems.map(x => ({ label: `Goal: ${x.label}`, value: x.value, type: 'goal', index: x.index })),
        ...investmentItems.map(x => ({ label: `Investment: ${x.label}`, value: x.value, type: 'investment', index: x.index })),
        ...allocationItems.map(x => ({ label: x.label, value: x.value, type: 'allocation', index: x.index }))
    ];

    const totalAllocated = items.reduce((sum, x) => sum + (Number(x.value) || 0), 0);

    let labels = items.map(x => x.label);
    let data = items.map(x => Math.max(0, Number(x.value) || 0));
    let colors = labels.map((_, i) => colorForIndex(i));

    const sliceMeta = items.map(x => ({ type: x.type, index: x.index }));

    if (disposable > 0) {
        if (totalAllocated <= disposable) {
            const unallocated = disposable - totalAllocated;
            labels.push('Unallocated');
            data.push(unallocated);
            colors.push('#9e9e9e');
            sliceMeta.push({ type: 'unallocated' });

            if (noteEl) noteEl.textContent = 'Chart includes Unallocated as the remaining disposable amount.';
        } else {
            const over = totalAllocated - disposable;
            labels.push('Overallocated');
            data.push(over);
            colors.push('#f44336');
            sliceMeta.push({ type: 'overallocated' });

            if (noteEl) noteEl.textContent = 'Overallocated shown in red (allocations exceed disposable).';
        }
    } else {
        if (noteEl) noteEl.textContent = 'Disposable is 0 or negative; chart shows allocations but there is no disposable to allocate.';
    }

    if (allocationChart) allocationChart.destroy();

    allocationChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onHover: (evt, elements) => {
                canvas.style.cursor = elements && elements.length ? 'pointer' : 'default';
            },
            onClick: (evt, elements) => {
                if (!elements || !elements.length) return;

                const sliceIndex = elements[0].index;
                const meta = allocationChart?.$sliceMeta?.[sliceIndex];
                if (!meta) return;

                if (meta.type === 'goal') {
                    scrollAndHighlight(document.getElementById(`goal-item-${meta.index}`));
                } else if (meta.type === 'investment') {
                    scrollAndHighlight(document.querySelectorAll('#investment-list .goal-item')[meta.index]);
                } else if (meta.type === 'allocation') {
                    scrollAndHighlight(document.getElementById(`alloc-row-${meta.index}`));
                } else {
                    scrollAndHighlight(document.getElementById('summary') || document.getElementById('allocations'));
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const val = Number(ctx.raw) || 0;
                            const base = disposable > 0 ? disposable : (data.reduce((s, v) => s + v, 0) || 1);
                            const pct = (val / base) * 100;
                            return `${ctx.label}: $${val.toFixed(2)} (${pct.toFixed(2)}%)`;
                        }
                    }
                }
            },
            cutout: '55%'
        }
    });

    allocationChart.$sliceMeta = sliceMeta;

    // Custom grouped legend (Goals / Investments / Allocations)
    renderAllocationLegend(labels, colors, sliceMeta);
}

// ────────────────────────────────────────────────────
// Custom grouped legend for allocation donut
// ────────────────────────────────────────────────────
function renderAllocationLegend(labels, colors, sliceMeta) {
    const container = document.getElementById('allocation-legend');
    if (!container) return;

    container.innerHTML = '';

    const groups = { goal: [], investment: [], allocation: [] };

    labels.forEach((label, i) => {
        const meta = sliceMeta[i];
        if (!meta || !groups[meta.type]) return;
        groups[meta.type].push({ label, color: colors[i], meta });
    });

    function renderGroup(title, items) {
        if (!items.length) return;
        const groupDiv = document.createElement('div');
        groupDiv.className = 'legend-group';
        groupDiv.innerHTML = `<h4>${title}</h4>`;

        items.forEach(item => {
            const row = document.createElement('div');
            row.className = 'legend-item';
            row.innerHTML = `
                <span class="legend-swatch" style="background:${item.color}"></span>
                <span>${item.label}</span>
            `;

            row.onclick = () => {
                if (item.meta.type === 'goal') {
                    scrollAndHighlight(document.getElementById(`goal-item-${item.meta.index}`));
                } else if (item.meta.type === 'investment') {
                    scrollAndHighlight(document.querySelectorAll('#investment-list .goal-item')[item.meta.index]);
                } else if (item.meta.type === 'allocation') {
                    scrollAndHighlight(document.getElementById(`alloc-row-${item.meta.index}`));
                }
            };

            groupDiv.appendChild(row);
        });

        container.appendChild(groupDiv);
    }

    renderGroup('Goals', groups.goal);
    renderGroup('Investments', groups.investment);
    renderGroup('Allocations', groups.allocation);
}

// ────────────────────────────────────────────────────
// Goal chart helper (adds warning color if overridden)
// ────────────────────────────────────────────────────
function updateGoalChart(index, monthlySavings, draftGoal = null, warn = false) {
    const goal = draftGoal || goals[index];
    const canvasId = `goal-chart-${index}`;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const dateEl = document.getElementById(`goal-end-date-${index}`);
    if (dateEl) dateEl.classList.toggle('goal-date-warning', !!warn);

    const amount = Number(goal.amount) || 0;
    const already = Number(goal.alreadySaved) || 0;
    const remaining = amount - already;

    if (remaining <= 0) {
        if (goalCharts[index]) {
            goalCharts[index].destroy();
            delete goalCharts[index];
        }
        if (dateEl) {
            dateEl.textContent = 'Completed';
            dateEl.classList.remove('goal-date-warning');
        }
        return;
    }

    if (!Number.isFinite(monthlySavings) || monthlySavings <= 0) {
        if (goalCharts[index]) {
            goalCharts[index].destroy();
            delete goalCharts[index];
        }
        if (dateEl) {
            dateEl.textContent = 'N/A';
            dateEl.classList.remove('goal-date-warning');
        }
        return;
    }

    const startDate = new Date();
    const monthsNeeded = Math.max(1, Math.ceil(remaining / monthlySavings));
    const projectedEnd = new Date(startDate);
    projectedEnd.setMonth(projectedEnd.getMonth() + monthsNeeded);

    if (dateEl) dateEl.textContent = projectedEnd.toLocaleDateString();

    const labels = [];
    const data = [already];
    let cumulative = already;

    for (let m = 1; m <= monthsNeeded; m++) {
        cumulative += monthlySavings;

        const monthDate = new Date(startDate);
        monthDate.setMonth(monthDate.getMonth() + m);

        labels.push(monthDate.toLocaleString('default', { month: 'short', year: 'numeric' }));
        data.push(Math.min(cumulative, amount));
    }

    const chartConfig = {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Cumulative Savings',
                data,
                borderColor: '#4CAF50',
                backgroundColor: 'rgba(76, 175, 80, 0.2)',
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, max: amount * 1.1 }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `$${ctx.raw.toFixed(2)}`
                    }
                }
            }
        }
    };

    if (goalCharts[index]) goalCharts[index].destroy();
    goalCharts[index] = new Chart(canvas.getContext('2d'), chartConfig);
}

// ────────────────────────────────────────────────────
// Add-goal form live recommendation + auto-fill
// ────────────────────────────────────────────────────
function updateNewGoalRecommendation() {
    const amount = parseFloat(document.getElementById('goal-amount')?.value);
    const alreadySaved = parseFloat(document.getElementById('goal-already-saved')?.value) || 0;
    const targetDate = document.getElementById('goal-target-date')?.value || '';
    const mode = document.getElementById('goal-alloc-mode')?.value || 'percent';

    const outEl = document.getElementById('new-goal-recommended');
    const allocValueEl = document.getElementById('goal-alloc-value');

    if (!Number.isFinite(amount) || amount <= 0 || !targetDate) {
        if (outEl) outEl.textContent = '';
        return;
    }

    const tempGoal = { amount, alreadySaved, targetDate, allocMode: mode, allocValue: 0 };

    const rec = recommendedAllocValueForMode(tempGoal, lastDisposable);
    const plan = rec.plan;

    const neededMonthlyText = `$${formatMoney(plan.requiredMonthly)} / mo`;
    const neededPercentText = (plan.requiredPercent == null) ? 'N/A' : `${plan.requiredPercent.toFixed(2)}% of disposable`;

    if (outEl) {
        outEl.textContent =
            `To hit your target: need ${neededMonthlyText} (${neededPercentText}).` +
            (mode === 'percent' && !rec.ok ? ' Percent is unavailable because disposable is 0 or negative.' : '');
    }

    if (rec.ok && allocValueEl) {
        allocValueEl.value = String(round2(rec.value));
    }
}

// ────────────────────────────────────────────────────
// Display
// ────────────────────────────────────────────────────
function updateDisplay() {
    const totalIncome = familyMembers.reduce((sum, member) => sum + (Number(incomes[member]) || 0), 0);
    const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
    const disposable = totalIncome - totalExpenses;
    lastDisposable = disposable;

    document.getElementById('total-income').textContent = formatMoney(totalIncome);
    document.getElementById('total-expenses').textContent = formatMoney(totalExpenses);
    document.getElementById('disposable').textContent = formatMoney(disposable);

    // Expenses table
    const tbody = document.getElementById('expense-list');
    tbody.innerHTML = '';

    expenses.forEach((exp, i) => {
        const tr = document.createElement('tr');
        tr.dataset.index = i;
        tr.innerHTML = `
            <td>${exp.desc}</td>
            <td>${formatMoney(Number(exp.amount))}</td>
            <td>${exp.category}</td>
            <td>${exp.owner}</td>
            <td class="action-buttons">
                <button class="edit-btn" onclick="startEditExpense(${i})">Edit</button>
                <button class="delete-btn" onclick="removeExpense(${i})">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (!expenseListSortable) {
        expenseListSortable = Sortable.create(tbody, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            onEnd: (evt) => {
                if (evt.oldIndex !== evt.newIndex) {
                    const [moved] = expenses.splice(evt.oldIndex, 1);
                    expenses.splice(evt.newIndex, 0, moved);
                    saveData();
                    updateDisplay();
                }
            }
        });
    }

    // Allocations table
    const allocBody = document.getElementById('allocation-list');
    allocBody.innerHTML = '';

    let allocationsTotal = 0;
    const allocationChartItems = [];

    allocations.forEach((a, i) => {
        const monthly = computeAllocationMonthly(a, disposable);
        const pct = percentOfDisposable(monthly, disposable);

        allocationsTotal += monthly;
        allocationChartItems.push({ label: a.name, value: monthly, index: i });

        const tr = document.createElement('tr');
        tr.id = `alloc-row-${i}`;
        tr.innerHTML = `
            <td><input type="text" id="alloc-name-${i}" value="${a.name}"></td>
            <td>
                <select id="alloc-mode-${i}">
                    <option value="percent" ${a.mode === 'percent' ? 'selected' : ''}>%</option>
                    <option value="fixed" ${a.mode === 'fixed' ? 'selected' : ''}>$</option>
                </select>
            </td>
            <td><input type="number" id="alloc-value-${i}" step="0.01" min="0" value="${Number(a.value) || 0}"></td>
            <td>$${formatMoney(monthly)}</td>
            <td>${pct.toFixed(2)}%</td>
            <td>
                <button class="delete-btn" onclick="removeAllocation(${i})">Delete</button>
            </td>
        `;
        allocBody.appendChild(tr);

        const nameInput = document.getElementById(`alloc-name-${i}`);
        const modeSelect = document.getElementById(`alloc-mode-${i}`);
        const valueInput = document.getElementById(`alloc-value-${i}`);

        nameInput.addEventListener('input', () => {
            allocations[i].name = nameInput.value;
            saveData();
            updateAllocationChart(disposable, buildGoalChartItems(disposable), buildInvestmentChartItems(disposable), buildAllocationChartItems(disposable));
        });

        modeSelect.addEventListener('change', () => {
            allocations[i].mode = modeSelect.value;
            saveData();
            updateDisplay();
        });

        // FIX: don't rerender on every digit; commit on blur/change (or Enter)
        commitOnEnter(valueInput);
        valueInput.addEventListener('change', () => {
            allocations[i].value = parseFloat(valueInput.value) || 0;
            saveData();
            updateDisplay();
        });
    });

    // Goals list
    const goalList = document.getElementById('goal-list');

    Object.values(goalCharts).forEach(ch => {
        try { ch.destroy(); } catch (_) { }
    });
    goalCharts = {};

    goalList.innerHTML = '';

    let goalsTotal = 0;
    const goalChartItems = [];

    goals.forEach((goal, i) => {
        const isEditing = (editingGoalIndex === i);
        const currentGoal = isEditing ? (goalEditDrafts[i] || goal) : goal;

        if (currentGoal.autoAlloc == null) currentGoal.autoAlloc = true;

        const rec = recommendedAllocValueForMode(currentGoal, disposable);
        const plan = rec.plan;

        if (currentGoal.autoAlloc && rec.ok) {
            const newVal = round2(rec.value);
            currentGoal.allocValue = newVal;

            if (!isEditing) {
                if (round2(goals[i].allocValue) !== newVal || goals[i].autoAlloc !== true) {
                    goals[i].allocValue = newVal;
                    goals[i].autoAlloc = true;
                    saveData();
                }
            } else if (goalEditDrafts[i]) {
                goalEditDrafts[i].allocValue = newVal;
            }
        }

        const monthly = computeGoalMonthlyContribution(currentGoal, disposable);
        const pct = percentOfDisposable(monthly, disposable);

        goalsTotal += monthly;
        goalChartItems.push({ label: currentGoal.name, value: monthly, index: i });

        const targetText = currentGoal.targetDate ? new Date(currentGoal.targetDate).toLocaleDateString() : 'N/A';
        const neededMonthlyText = `$${formatMoney(plan.requiredMonthly)} / mo`;
        const neededPercentText = (plan.requiredPercent == null) ? 'N/A' : `${plan.requiredPercent.toFixed(2)}% of disposable`;

        const recommendedLine = `
            <p class="goal-recommended">
                To hit target by ${targetText}: need ${neededMonthlyText} (${neededPercentText}).
                ${currentGoal.allocMode === 'percent' && !rec.ok ? ' Percent unavailable because disposable is 0 or negative.' : ''}
            </p>
        `;

        const showReset = !currentGoal.autoAlloc;

        const li = document.createElement('li');
        li.classList.add('goal-item');
        li.id = `goal-item-${i}`;

        if (!isEditing) {
            li.innerHTML = `
                <h4>${goal.name}</h4>
                <p>
                    Total: $${formatMoney(goal.amount)} |
                    Already Saved: $${formatMoney(goal.alreadySaved)} |
                    Target Date: ${goal.targetDate ? new Date(goal.targetDate).toLocaleDateString() : 'N/A'} |
                    Projected End: <span id="goal-end-date-${i}">...</span>
                </p>

                ${recommendedLine}

                <p id="goal-status-${i}">
                    Using $${formatMoney(monthly)} / mo (${pct.toFixed(2)}% of disposable).
                </p>

                <div class="goal-alloc-controls">
                    <label>
                        Goal Allocation Type:
                        <select id="goal-alloc-mode-${i}">
                            <option value="percent" ${goal.allocMode === 'percent' ? 'selected' : ''}>% of Disposable</option>
                            <option value="fixed" ${goal.allocMode === 'fixed' ? 'selected' : ''}>Fixed $ / month</option>
                        </select>
                    </label>

                    <label>
                        Value:
                        <input type="number" id="goal-alloc-value-${i}" step="0.01" min="0" value="${Number(goal.allocValue) || 0}">
                    </label>

                    ${showReset ? `<button class="reset-btn" onclick="resetGoalAllocation(${i})">Reset to Target</button>` : ''}

                    <button class="edit-btn" onclick="startEditGoal(${i})">Edit</button>
                    <button class="delete-btn" onclick="removeGoal(${i})">Remove Goal</button>
                </div>

                <div class="goal-chart-container">
                    <canvas id="goal-chart-${i}"></canvas>
                </div>
            `;
            goalList.appendChild(li);

            const modeEl = document.getElementById(`goal-alloc-mode-${i}`);
            const valEl = document.getElementById(`goal-alloc-value-${i}`);

            modeEl.addEventListener('change', () => {
                goals[i].allocMode = modeEl.value;
                saveData();
                updateDisplay();
            });

            // FIX: don't rerender on every digit; commit on blur/change (or Enter)
            commitOnEnter(valEl);
            valEl.addEventListener('change', () => {
                goals[i].allocValue = parseFloat(valEl.value) || 0;
                goals[i].autoAlloc = false; // user override
                saveData();
                updateDisplay();
            });

            updateGoalChart(i, monthly, null, !goal.autoAlloc);
        } else {
            li.innerHTML = `
                <h4>Edit Goal</h4>

                <div class="goal-edit-grid">
                    <label>
                        Name:
                        <input type="text" id="goal-edit-name-${i}" value="${currentGoal.name ?? ''}">
                    </label>

                    <label>
                        Total Amount Needed:
                        <input type="number" id="goal-edit-amount-${i}" step="0.01" min="0" value="${Number(currentGoal.amount) || 0}">
                    </label>

                    <label>
                        Already Saved:
                        <input type="number" id="goal-edit-already-${i}" step="0.01" min="0" value="${Number(currentGoal.alreadySaved) || 0}">
                    </label>

                    <label>
                        Target Date:
                        <input type="date" id="goal-edit-target-${i}" value="${currentGoal.targetDate || ''}">
                    </label>

                    <label>
                        Allocation Type:
                        <select id="goal-edit-alloc-mode-${i}">
                            <option value="percent" ${currentGoal.allocMode === 'percent' ? 'selected' : ''}>% of Disposable</option>
                            <option value="fixed" ${currentGoal.allocMode === 'fixed' ? 'selected' : ''}>Fixed $ / month</option>
                        </select>
                    </label>

                    <label>
                        Allocation Value:
                        <input type="number" id="goal-edit-alloc-value-${i}" step="0.01" min="0" value="${Number(currentGoal.allocValue) || 0}">
                    </label>
                </div>

                <p>
                    Target Date: ${targetText} | Projected End: <span id="goal-end-date-${i}">...</span>
                </p>

                ${recommendedLine}

                <p id="goal-status-${i}">
                    Using $${formatMoney(monthly)} / mo (${pct.toFixed(2)}% of disposable).
                </p>

                <div class="goal-edit-actions">
                    <button class="save-btn" onclick="saveEditGoal(${i})">Save</button>
                    <button class="cancel-btn" onclick="cancelEditGoal(${i})">Cancel</button>
                    ${showReset ? `<button class="reset-btn" onclick="resetGoalAllocation(${i})">Reset to Target</button>` : ''}
                    <button class="delete-btn" onclick="removeGoal(${i})">Remove Goal</button>
                </div>

                <div class="goal-chart-container">
                    <canvas id="goal-chart-${i}"></canvas>
                </div>
            `;
            goalList.appendChild(li);

            const nameEl = document.getElementById(`goal-edit-name-${i}`);
            const amtEl = document.getElementById(`goal-edit-amount-${i}`);
            const alreadyEl = document.getElementById(`goal-edit-already-${i}`);
            const targetEl = document.getElementById(`goal-edit-target-${i}`);
            const modeEl = document.getElementById(`goal-edit-alloc-mode-${i}`);
            const valEl = document.getElementById(`goal-edit-alloc-value-${i}`);

            if (!goalEditDrafts[i]) goalEditDrafts[i] = { ...goal };

            const onDraftChange = () => {
                goalEditDrafts[i].name = nameEl.value;
                goalEditDrafts[i].amount = parseFloat(amtEl.value) || 0;
                goalEditDrafts[i].alreadySaved = parseFloat(alreadyEl.value) || 0;
                goalEditDrafts[i].targetDate = targetEl.value;
                goalEditDrafts[i].allocMode = modeEl.value;
                goalEditDrafts[i].allocValue = parseFloat(valEl.value) || 0;

                recalcGoalPreview(i);
                updateAllocationChart(disposable, buildGoalChartItems(disposable), buildInvestmentChartItems(disposable), buildAllocationChartItems(disposable));
            };

            nameEl.addEventListener('input', onDraftChange);
            amtEl.addEventListener('input', onDraftChange);
            alreadyEl.addEventListener('input', onDraftChange);
            targetEl.addEventListener('change', onDraftChange);
            modeEl.addEventListener('change', onDraftChange);

            // allocation value change = manual override (we keep it live in edit view)
            valEl.addEventListener('input', () => {
                goalEditDrafts[i].autoAlloc = false;
                onDraftChange();
            });

            updateGoalChart(i, monthly, goalEditDrafts[i], !goalEditDrafts[i].autoAlloc);
        }
    });


    // ────────────────────────────────────────────────────
    // Investments list
    // ────────────────────────────────────────────────────
    const invList = document.getElementById('investment-list');

    // destroy old charts
    Object.values(investmentCharts).forEach(ch => {
        try { ch.destroy(); } catch (_) { }
    });
    investmentCharts = {};

    let investmentsTotal = 0;
    const investmentChartItems = [];

    if (invList) {
        invList.innerHTML = '';

        investments.forEach((inv, i) => {
            const isEditing = (editingInvestmentIndex === i);
            const currentInv = isEditing ? (investmentEditDrafts[i] || inv) : inv;

            const year = projectInvestmentForYear(currentInv);
            const yearLabel = new Date().getFullYear();

            investmentsTotal += Number(currentInv.monthlyContribution) || 0;
            investmentChartItems.push({ label: currentInv.name, value: Number(currentInv.monthlyContribution) || 0, index: i });

            const li = document.createElement('li');
            li.classList.add('goal-item');

            if (!isEditing) {
                li.innerHTML = `
                    <h4>${currentInv.name}</h4>
                    <p>
                        $${formatMoney(currentInv.monthlyContribution)} / month |
                        ${currentInv.years} years |
                        ${currentInv.annualRate}% est.
                    </p>
                    <p class="goal-recommended">
                        ${yearLabel} Projection:
                        Contribute $${formatMoney(year.contributed)} → Value $${formatMoney(year.endValue)}
                        (${year.gain >= 0 ? '+' : ''}$${formatMoney(year.gain)})
                    </p>
                    <p class="investment-disclaimer">Returns are estimates, not guarantees.</p>
                    <div class="goal-chart-container">
                        <canvas id="investment-chart-${i}"></canvas>
                    </div>
                    <button class="edit-btn" onclick="startEditInvestment(${i})">Edit</button>
                    <button class="delete-btn" onclick="removeInvestment(${i})">Remove</button>
                `;
                invList.appendChild(li);
                updateInvestmentChart(i, currentInv);
            } else {
                li.innerHTML = `
                    <h4>Edit Investment</h4>
                    <div class="goal-edit-grid">
                        <label>
                            Name:
                            <input type="text" id="inv-edit-name-${i}" value="${currentInv.name ?? ''}">
                        </label>
                        <label>
                            $ / month:
                            <input type="number" id="inv-edit-monthly-${i}" step="0.01" min="0" value="${Number(currentInv.monthlyContribution) || 0}">
                        </label>
                        <label>
                            Years:
                            <input type="number" id="inv-edit-years-${i}" min="0" value="${Number(currentInv.years) || 0}">
                        </label>
                        <label>
                            Est. Annual Return (%):
                            <input type="number" id="inv-edit-rate-${i}" step="0.01" min="0" value="${Number(currentInv.annualRate) || 0}">
                        </label>
                    </div>
                    <p class="investment-disclaimer">Returns are estimates, not guarantees.</p>
                    <div class="goal-edit-actions">
                        <button class="save-btn" onclick="saveEditInvestment(${i})">Save</button>
                        <button class="cancel-btn" onclick="cancelEditInvestment()">Cancel</button>
                        <button class="delete-btn" onclick="removeInvestment(${i})">Remove</button>
                    </div>
                `;
                invList.appendChild(li);

                if (!investmentEditDrafts[i]) investmentEditDrafts[i] = { ...inv };

                const nameEl = document.getElementById(`inv-edit-name-${i}`);
                const mEl = document.getElementById(`inv-edit-monthly-${i}`);
                const yEl = document.getElementById(`inv-edit-years-${i}`);
                const rEl = document.getElementById(`inv-edit-rate-${i}`);

                const onInvDraftChange = () => {
                    investmentEditDrafts[i].name = nameEl.value;
                    investmentEditDrafts[i].monthlyContribution = parseFloat(mEl.value) || 0;
                    investmentEditDrafts[i].years = parseInt(yEl.value, 10) || 0;
                    investmentEditDrafts[i].annualRate = parseFloat(rEl.value) || 0;

                    // live update chart and donut
                    updateAllocationChart(disposable, buildGoalChartItems(disposable), buildInvestmentChartItems(disposable), buildAllocationChartItems(disposable));
                };

                nameEl.addEventListener('input', onInvDraftChange);
                mEl.addEventListener('input', onInvDraftChange);
                yEl.addEventListener('input', onInvDraftChange);
                rEl.addEventListener('input', onInvDraftChange);
            }
        });
    }

    const totalAllocated = allocationsTotal + goalsTotal + investmentsTotal;
    const remaining = disposable - totalAllocated;

    document.getElementById('total-allocated').textContent = formatMoney(totalAllocated);

    const remainingEl = document.getElementById('remaining');
    remainingEl.textContent = formatMoney(remaining);
    remainingEl.classList.toggle('negative', remaining < 0);
    remainingEl.classList.toggle('positive', remaining >= 0);

    updateAllocationChart(disposable, goalChartItems, investmentChartItems, allocationChartItems);
    updateCharts();

    updateNewGoalRecommendation();
}

// Used for quick chart refresh during allocation name edits / goal editing
function buildGoalChartItems(disposable) {
    return goals.map((g, i) => {
        const current = (editingGoalIndex === i && goalEditDrafts[i]) ? goalEditDrafts[i] : g;
        return { label: current.name, value: computeGoalMonthlyContribution(current, disposable), index: i };
    });
}


function buildInvestmentChartItems(disposable) {
    return investments.map((inv, i) => {
        const current = (editingInvestmentIndex === i && investmentEditDrafts[i]) ? investmentEditDrafts[i] : inv;
        return { label: current.name, value: Number(current.monthlyContribution) || 0, index: i };
    });
}

function buildAllocationChartItems(disposable) {
    return allocations.map((a, i) => ({
        label: a.name,
        value: computeAllocationMonthly(a, disposable),
        index: i
    }));
}

// ────────────────────────────────────────────────────
// Initialize
// ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
    loadData();

    // Data Export / Import UI (only active if buttons exist in the HTML)
    const exportBtn = document.getElementById('export-data-btn');
    if (exportBtn) exportBtn.addEventListener('click', exportAppDataToFile);

    const importBtn = document.getElementById('import-data-btn');
    const importInput = document.getElementById('import-data-input');
    if (importBtn && importInput) {
        importBtn.addEventListener('click', () => importInput.click());
        importInput.addEventListener('change', () => {
            const file = importInput.files && importInput.files[0];
            if (file) importAppDataFromFile(file);
            importInput.value = '';
        });
    }

    // Live recommend + auto-fill for the "Add Goal" form
    const bind = (id, evt) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener(evt, updateNewGoalRecommendation);
    };

    bind('goal-amount', 'input');
    bind('goal-already-saved', 'input');
    bind('goal-target-date', 'change');
    bind('goal-alloc-mode', 'change');

    // (Optional) Keep this if you want the add-form alloc value to re-snap on later edits.
    bind('goal-alloc-value', 'input');

    updateNewGoalRecommendation();
});
