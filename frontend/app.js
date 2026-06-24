// Preset JSON values
const PRESETS = {
  sample: `{\n  "data": [\n    "A->B", "A->C", "B->D", "C->E", "E->F",\n    "X->Y", "Y->Z", "Z->X",\n    "P->Q", "Q->R",\n    "G->H", "G->H", "G->I",\n    "hello", "1->2", "A->"\n  ]\n}`,
  cycle: `{\n  "data": [\n    "A->B", "B->C", "C->A",\n    "D->E", "E->D"\n  ]\n}`,
  duplicate: `{\n  "data": [\n    "A->B", "A->C", "A->B", "A->B", "C->D"\n  ]\n}`,
  diamond: `{\n  "data": [\n    "A->D", "B->D", "A->B", "X->Y"\n  ]\n}`
};

// Event Listeners for Presets
document.getElementById('btn-preset-sample').addEventListener('click', () => setInput(PRESETS.sample));
document.getElementById('btn-preset-cycle').addEventListener('click', () => setInput(PRESETS.cycle));
document.getElementById('btn-preset-duplicate').addEventListener('click', () => setInput(PRESETS.duplicate));
document.getElementById('btn-preset-diamond').addEventListener('click', () => setInput(PRESETS.diamond));

function setInput(val) {
  const textarea = document.getElementById('node-input');
  textarea.value = val;
  textarea.focus();
}

// Tab Management
function switchTab(tabId) {
  const tabs = ['hierarchies', 'invalid', 'duplicates', 'json'];
  tabs.forEach(id => {
    const btn = document.getElementById(`tab-${id}`);
    const content = document.getElementById(`content-${id}`);
    if (id === tabId) {
      btn.classList.add('active');
      content.classList.add('active');
    } else {
      btn.classList.remove('active');
      content.classList.remove('active');
    }
  });
}

// Form Submission & API Request
document.getElementById('api-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const apiUrl = document.getElementById('api-url').value.trim();
  const rawInput = document.getElementById('node-input').value.trim();
  const submitBtn = document.getElementById('btn-submit');
  const errorAlert = document.getElementById('error-alert');
  const errorMessage = document.getElementById('error-message');
  const emptyState = document.getElementById('empty-state');
  const resultsContent = document.getElementById('results-content');

  // Smart parser: handle JSON arrays, JSON objects with 'data', or comma/newline delimited strings
  let dataArray = [];
  if (rawInput.startsWith('[') && rawInput.endsWith(']')) {
    try {
      dataArray = JSON.parse(rawInput);
    } catch (err) {
      dataArray = parseDelimited(rawInput);
    }
  } else if (rawInput.startsWith('{') && rawInput.endsWith('}')) {
    try {
      const parsed = JSON.parse(rawInput);
      dataArray = parsed.data || [];
    } catch (err) {
      dataArray = parseDelimited(rawInput);
    }
  } else {
    dataArray = parseDelimited(rawInput);
  }

  // UI State: Loading
  submitBtn.classList.add('loading');
  submitBtn.disabled = true;
  errorAlert.style.display = 'none';

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data: dataArray })
    });

    if (!response.ok) {
      let errText = `HTTP ${response.status} (${response.statusText})`;
      try {
        const errJson = await response.json();
        if (errJson.error) errText = errJson.error;
      } catch (e) {}
      throw new Error(`API returned an error: ${errText}`);
    }

    const responseData = await response.json();

    // Render successful output
    renderResults(responseData);
    emptyState.classList.add('hidden');
    resultsContent.classList.remove('hidden');
  } catch (error) {
    errorMessage.textContent = error.message || "Failed to connect to API. Verify CORS is enabled and server is running.";
    errorAlert.style.display = 'flex';
  } finally {
    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;
  }
});

function parseDelimited(input) {
  return input.split(/,|\n/).map(s => s.trim()).filter(s => s.length > 0);
}

// Copy Raw JSON Functionality
function copyRawJson() {
  const jsonText = document.getElementById('raw-json-output').textContent;
  navigator.clipboard.writeText(jsonText).then(() => {
    const iconCopy = document.getElementById('icon-copy');
    const iconCheck = document.getElementById('icon-check');
    const textCopy = document.getElementById('text-copy');
    
    iconCopy.style.display = 'none';
    iconCheck.style.display = 'inline-block';
    textCopy.textContent = 'Copied!';
    
    setTimeout(() => {
      iconCopy.style.display = 'inline-block';
      iconCheck.style.display = 'none';
      textCopy.textContent = 'Copy JSON';
    }, 2000);
  }).catch(() => {
    alert('Failed to copy JSON to clipboard.');
  });
}

// Render Results to DOM
function renderResults(data) {
  // 1. Summary Stats
  const summary = data.summary || { total_trees: 0, total_cycles: 0, largest_tree_root: null };
  document.getElementById('val-total-trees').textContent = summary.total_trees ?? 0;
  document.getElementById('val-total-cycles').textContent = summary.total_cycles ?? 0;
  document.getElementById('val-largest-root').textContent = summary.largest_tree_root || '-';

  // 2. Tab Badges
  const hierarchies = data.hierarchies || [];
  const invalid = data.invalid_entries || [];
  const duplicates = data.duplicate_edges || [];

  document.getElementById('badge-hierarchies').textContent = hierarchies.length;
  document.getElementById('badge-invalid').textContent = invalid.length;
  document.getElementById('badge-duplicates').textContent = duplicates.length;

  // 3. Raw JSON
  document.getElementById('raw-json-output').textContent = JSON.stringify(data, null, 2);

  // 4. Render Hierarchies
  const hierarchiesList = document.getElementById('hierarchies-list');
  hierarchiesList.innerHTML = '';
  
  if (hierarchies.length === 0) {
    hierarchiesList.innerHTML = '<div class="empty-state">No hierarchies or cyclic groups detected.</div>';
  } else {
    hierarchies.forEach(h => {
      const card = document.createElement('div');
      card.className = 'hierarchy-card';

      let statusBadge = '';
      if (h.has_cycle) {
        statusBadge = `<span class="badge badge-cycle">Cyclic Group</span>`;
      } else {
        statusBadge = `<span class="badge badge-depth">Depth: ${h.depth}</span>`;
      }

      let bodyHTML = '';
      if (h.has_cycle) {
        bodyHTML = `<div class="cycle-notice">Cycle detected in this group. Tree structure is empty {}.</div>`;
      } else {
        bodyHTML = renderTreeDOM(h.tree, true);
      }

      card.innerHTML = `
        <div class="hierarchy-card-header">
          <span>Root Node: ${escapeHtml(h.root || '?')}</span>
          ${statusBadge}
        </div>
        <div class="hierarchy-card-body">
          ${bodyHTML}
        </div>
      `;
      hierarchiesList.appendChild(card);
    });
  }

  // 5. Render Invalid Entries
  const invalidList = document.getElementById('invalid-list');
  invalidList.innerHTML = '';
  if (invalid.length === 0) {
    invalidList.innerHTML = '<div class="empty-state" style="padding:32px;">No invalid entries detected.</div>';
  } else {
    invalid.forEach(entry => {
      const tag = document.createElement('div');
      tag.className = 'tag';
      tag.textContent = String(entry);
      invalidList.appendChild(tag);
    });
  }

  // 6. Render Duplicate Edges
  const duplicatesList = document.getElementById('duplicates-list');
  duplicatesList.innerHTML = '';
  if (duplicates.length === 0) {
    duplicatesList.innerHTML = '<div class="empty-state" style="padding:32px;">No duplicate edges detected.</div>';
  } else {
    duplicates.forEach(entry => {
      const tag = document.createElement('div');
      tag.className = 'tag';
      tag.textContent = String(entry);
      duplicatesList.appendChild(tag);
    });
  }
}

// Recursive function to generate clean HTML for tree nodes with pure CSS indentation/connecting lines
function renderTreeDOM(treeObj, isRoot = false) {
  if (!treeObj || typeof treeObj !== 'object') return '';
  const keys = Object.keys(treeObj);
  if (keys.length === 0) return '';

  let html = '';
  keys.forEach(key => {
    const childrenHTML = renderTreeDOM(treeObj[key], false);
    html += `
      <div class="tree-node ${isRoot ? 'tree-root-level' : ''}">
        <div class="tree-label">${escapeHtml(key)}</div>
        ${childrenHTML}
      </div>
    `;
  });
  return html;
}

function escapeHtml(val) {
  const str = String(val);
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
