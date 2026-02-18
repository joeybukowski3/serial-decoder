// State
var currentCategory = 'appliances';

// Init — populate brands for default category
document.addEventListener('DOMContentLoaded', function() {
    populateBrands('appliances');

    document.getElementById('brand').addEventListener('change', updateDecodeBtn);
    document.getElementById('serial').addEventListener('input', updateDecodeBtn);
    document.getElementById('serial').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') decodeSerial();
    });
    document.getElementById('altQuery').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') estimateAge();
    });
});

function selectCategory(cat, btn) {
    currentCategory = cat;
    document.querySelectorAll('.cat-tab').forEach(function(t) { t.classList.remove('active'); });
    btn.classList.add('active');
    populateBrands(cat);
    document.getElementById('serial').value = '';
    document.getElementById('serialResults').classList.add('hidden');
    document.getElementById('ageResults').classList.add('hidden');
    updateDecodeBtn();
}

function populateBrands(category) {
    var sel = document.getElementById('brand');
    var brands = decoderData[category].brands;
    sel.innerHTML = '<option value="">-- Select Brand --</option>';
    brands.forEach(function(b) {
        var opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = b.name;
        sel.appendChild(opt);
    });
}

function updateDecodeBtn() {
    var brand = document.getElementById('brand').value;
    var serial = document.getElementById('serial').value.trim();
    document.getElementById('decodeBtn').disabled = !(brand && serial);
}

function decodeSerial() {
    var brandId = document.getElementById('brand').value;
    var serial = document.getElementById('serial').value.trim();
    if (!brandId || !serial) return;

    var decoder = decoderData[currentCategory].decoders[brandId];
    if (!decoder) { alert('Decoder not found for this brand'); return; }

    var result = decoder.decode(serial);
    if (!result) { alert('Could not decode this serial number. Please check the format and try again.'); return; }

    document.getElementById('resultYear').textContent = result.year;
    document.getElementById('resultMonth').textContent = result.month;
    document.getElementById('resultBrand').textContent = decoder.name;
    document.getElementById('resultMethod').textContent = decoder.method || decoder.serialLengthNote || 'N/A';
    document.getElementById('resultNotes').textContent = decoder.notes || decoder.decodeNotes || 'N/A';
    document.getElementById('resultExample').textContent = decoder.exampleSerial
        ? decoder.exampleSerial + ' → ' + decoder.exampleResult
        : 'N/A';
    document.getElementById('resultSources').textContent = decoder.source || decoder.sources || 'N/A';

    document.getElementById('serialResults').classList.remove('hidden');
    document.getElementById('ageResults').classList.add('hidden');
    document.getElementById('serialResults').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Alt lookup
function toggleAlt() {
    var section = document.getElementById('altSection');
    var toggle = document.querySelector('.alt-toggle');
    section.classList.toggle('open');
    toggle.classList.toggle('open');
}

function toggleHowTo() {
    var content = document.getElementById('howToContent');
    var toggle = document.querySelector('.how-to-toggle');
    content.classList.toggle('open');
    toggle.classList.toggle('open');
}

async function estimateAge() {
    var query = document.getElementById('altQuery').value.trim();
    if (!query) return;

    document.getElementById('ageResults').classList.add('hidden');
    document.getElementById('serialResults').classList.add('hidden');
    document.getElementById('ageLoading').classList.remove('hidden');

    try {
        var res = await fetch('/api/age-lookup?query=' + encodeURIComponent(query));
        var data = await res.json();

        if (data.error) {
            document.getElementById('ageLoading').classList.add('hidden');
            alert('Error: ' + data.error);
            return;
        }

        var body = document.getElementById('ageResultsBody');
        var html = '';

        if (data.brand) {
            html += '<div class="result-row"><span class="result-label">Brand</span><span class="result-value">' + esc(data.brand) + '</span></div>';
        }
        if (data.model) {
            html += '<div class="result-row"><span class="result-label">Model</span><span class="result-value">' + esc(data.model) + '</span></div>';
        }
        if (data.estimatedYear) {
            html += '<div class="result-row"><span class="result-label">Estimated Year</span><span class="result-value">' + esc(data.estimatedYear) + '</span></div>';
        }
        if (data.yearRange) {
            html += '<div class="result-row"><span class="result-label">Production Range</span><span class="result-value">' + esc(data.yearRange) + '</span></div>';
        }
        if (data.confidence) {
            var cls = data.confidence.toLowerCase();
            html += '<div class="result-row"><span class="result-label">Confidence</span><span class="confidence-badge ' + cls + '">' + esc(data.confidence) + '</span></div>';
        }

        if (data.evidence && data.evidence.length > 0) {
            html += '<div class="info-block method"><h4>Evidence</h4><div class="evidence-list">';
            data.evidence.forEach(function(ev) {
                html += '<div class="evidence-item">';
                html += '<span class="ev-source">' + esc(ev.source) + '</span>';
                if (ev.date) html += '<span class="ev-date">' + esc(ev.date) + '</span>';
                html += '<span>' + esc(ev.detail) + '</span>';
                html += '</div>';
            });
            html += '</div></div>';
        }

        if (data.notes) {
            html += '<div class="info-block notes"><h4>Notes</h4><p>' + esc(data.notes) + '</p></div>';
        }

        body.innerHTML = html;
        document.getElementById('ageLoading').classList.add('hidden');
        document.getElementById('ageResults').classList.remove('hidden');
        document.getElementById('ageResults').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {
        document.getElementById('ageLoading').classList.add('hidden');
        alert('Error estimating age. Please try again.');
    }
}

function esc(s) {
    if (!s) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}
