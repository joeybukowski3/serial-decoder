// Main application JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const categorySelect = document.getElementById('category');
    const brandSelect = document.getElementById('brand');
    const serialInput = document.getElementById('serial');
    const decodeBtn = document.getElementById('decodeBtn');
    const resultsDiv = document.getElementById('results');
    
    // Tab functionality
    setupTabs();
    
    // Category change handler
    categorySelect.addEventListener('change', function() {
        const category = this.value;
        brandSelect.disabled = !category;
        serialInput.disabled = !category;
        
        if (category) {
            populateBrands(category);
        } else {
            brandSelect.innerHTML = '<option value="">-- Select Category First --</option>';
            serialInput.value = '';
            decodeBtn.disabled = true;
            resultsDiv.classList.add('hidden');
        }
    });
    
    // Brand change handler
    brandSelect.addEventListener('change', function() {
        decodeBtn.disabled = !this.value;
        resultsDiv.classList.add('hidden');
    });
    
    // Serial input handler
    serialInput.addEventListener('input', function() {
        if (this.value && brandSelect.value) {
            decodeBtn.disabled = false;
        }
    });
    
    // Decode button handler
    decodeBtn.addEventListener('click', decodeSerial);
    
    // Enter key support
    serialInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !decodeBtn.disabled) {
            decodeSerial();
        }
    });
    
    // Load database tables
    loadAppliancesDatabase();
    loadElectronicsDatabase();
});

function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            
            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked button and corresponding content
            this.classList.add('active');
            document.getElementById(tabName).classList.add('active');
        });
    });
}

function populateBrands(category) {
    const brandSelect = document.getElementById('brand');
    const brands = decoderData[category].brands;
    
    brandSelect.innerHTML = '<option value="">-- Select Brand --</option>';
    brands.forEach(brand => {
        const option = document.createElement('option');
        option.value = brand.id;
        option.textContent = brand.name;
        brandSelect.appendChild(option);
    });
}

function decodeSerial() {
    const category = document.getElementById('category').value;
    const brandId = document.getElementById('brand').value;
    const serial = document.getElementById('serial').value.trim();
    
    if (!category || !brandId || !serial) {
        alert('Please fill in all fields');
        return;
    }
    
    const decoder = decoderData[category].decoders[brandId];
    if (!decoder) {
        alert('Decoder not found for this brand');
        return;
    }
    
    const result = decoder.decode(serial);
    
    if (!result) {
        alert('Invalid serial number format. Please check the serial number and try again.');
        return;
    }
    
    // Display results
    document.getElementById('resultYear').textContent = result.year;
    document.getElementById('resultMonth').textContent = result.month;
    document.getElementById('resultMethod').textContent = decoder.method;
    document.getElementById('resultNotes').textContent = decoder.notes;
    
    // Show results section
    document.getElementById('results').classList.remove('hidden');
    
    // Scroll to results
    document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function loadAppliancesDatabase() {
    const container = document.getElementById('appliancesTable');
    const searchBox = document.getElementById('applianceSearch');
    
    const brands = decoderData.appliances.decoders;
    
    function renderBrands(filterText = '') {
        container.innerHTML = '';
        
        let matchFound = false;
        
        Object.keys(brands).forEach(key => {
            const brand = brands[key];
            
            // Filter
            if (filterText && !brand.name.toLowerCase().includes(filterText.toLowerCase())) {
                return;
            }
            
            matchFound = true;
            
            const section = document.createElement('div');
            section.className = 'brand-section';
            
            section.innerHTML = `
                <div class="brand-header">${brand.name}</div>
                <div class="brand-content">
                    <div class="decode-info">
                        <p><strong>Products:</strong> ${brand.products}</p>
                        <p><strong>Decoding Method:</strong> ${brand.method}</p>
                        <p><strong>Notes:</strong> ${brand.notes}</p>
                        <p><strong>Source:</strong> ${brand.source}</p>
                    </div>
                </div>
            `;
            
            container.appendChild(section);
        });
        
        if (!matchFound) {
            container.innerHTML = '<div class="no-results">No brands found matching your search.</div>';
        }
    }
    
    renderBrands();
    
    searchBox.addEventListener('input', function() {
        renderBrands(this.value);
    });
}

function loadElectronicsDatabase() {
    const container = document.getElementById('electronicsTable');
    const searchBox = document.getElementById('electronicsSearch');
    
    const brands = decoderData.electronics.decoders;
    
    function renderBrands(filterText = '') {
        container.innerHTML = '';
        
        let matchFound = false;
        
        Object.keys(brands).forEach(key => {
            const brand = brands[key];
            
            // Filter
            if (filterText && !brand.name.toLowerCase().includes(filterText.toLowerCase())) {
                return;
            }
            
            matchFound = true;
            
            const section = document.createElement('div');
            section.className = 'brand-section';
            
            section.innerHTML = `
                <div class="brand-header">${brand.name}</div>
                <div class="brand-content">
                    <div class="decode-info">
                        <p><strong>Products:</strong> ${brand.products}</p>
                        <p><strong>Decoding Method:</strong> ${brand.method}</p>
                        <p><strong>Notes:</strong> ${brand.notes}</p>
                        <p><strong>Source:</strong> ${brand.source}</p>
                    </div>
                </div>
            `;
            
            container.appendChild(section);
        });
        
        if (!matchFound) {
            container.innerHTML = '<div class="no-results">No brands found matching your search.</div>';
        }
    }
    
    renderBrands();
    
    searchBox.addEventListener('input', function() {
        renderBrands(this.value);
    });
}
