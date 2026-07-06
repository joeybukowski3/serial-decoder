function decodeWhirlpoolFamilyByLength(serial, yearMap) {
  if (!serial) return null;
  var serialNumber = String(serial).replace(/[^A-Za-z0-9]/g, '');
  if (serialNumber.length !== 9 && serialNumber.length !== 10) return null;

  var yearCharacterPosition = serialNumber.length === 9 ? 2 : 3;
  var zeroBasedYearIndex = yearCharacterPosition - 1;
  var yearCharacter = serialNumber[zeroBasedYearIndex];
  var weekCharacters = serialNumber.substring(zeroBasedYearIndex + 1, zeroBasedYearIndex + 3);
  var yearCodeCharacter = yearCharacter.toUpperCase();
  var decodedYear = yearMap[yearCodeCharacter];

  return {
    year: decodedYear || 'Unknown code: ' + yearCodeCharacter,
    month: 'Week ' + weekCharacters,
    yearCode: yearCodeCharacter,
    weekDigits: weekCharacters,
    yearCharacterPosition: yearCharacterPosition
  };
}

function decodeAOSmithFamilyNumericYYWW(serial) {
  if (!serial || serial.length < 4) return null;
  var yy = serial.substring(0, 2);
  var ww = serial.substring(2, 4);
  if (!/^\d{2}$/.test(yy) || !/^\d{2}$/.test(ww)) return null;

  var week = parseInt(ww, 10);
  if (week < 1 || week > 53) return null;

  var yr2 = parseInt(yy, 10);
  var fullYear = 2000 + yr2;
  if (fullYear > new Date().getFullYear()) {
    fullYear = 1900 + yr2;
  }

  return {
    year: String(fullYear),
    month: 'Week ' + week,
    yearCode: yy,
    weekDigits: ww,
    decodeStyle: 'Numeric YYWW'
  };
}

// Serial Number Decoder Database â€” Auto-generated from CSV
// Generated: 2026-02-17
// Source of truth for runtime decoding; CSV files are not loaded by the app.

(function(global) {
  var categoryData = {
    brands: [
      { id: 'goodman', name: 'Goodman' },
      { id: 'amana', name: 'Amana' },
      { id: 'carrier', name: 'Carrier' },
      { id: 'bryant', name: 'Bryant' },
      { id: 'payne', name: 'Payne' },
      { id: 'rheem', name: 'Rheem' },
      { id: 'ruud', name: 'Ruud' },
      { id: 'trane', name: 'Trane' },
      { id: 'american_standard', name: 'American Standard' },
      { id: 'lennox', name: 'Lennox' },
      { id: 'york', name: 'York' }
    ],
    decoders: {
    'goodman': {
      name: 'Goodman',
      parentManufacturer: 'Goodman Manufacturing Company',
      groupId: 'HVAC-1',
      products: 'Air Conditioner; Heat Pump; Furnace; Air Handler',
      serialEra: 'N/A',
      serialLengthNote: 'Serials typically start with 4 digits. Format: YYMM....',
      decodeMethod: 'Digits 1-2 (year), digits 3-4 (month). Source: Manufacturer Technical Specifications.',
      yearCodePosition: 'Digits 1-2',
      monthCodePosition: 'Digits 3-4',
      outputType: 'Month + Year',
      decodeNotes: 'First two digits represent the year and the next two digits represent the month.',
      exampleSerial: '1506XXXX',
      exampleResult: '15=2015 and 06=June -> June 2015',
      sources: 'goodmanmfg.com technical documentation; hvac-talk.com; acwholesalers.com',
      method: 'First two digits represent the year and the next two digits represent the month.',
      notes: 'Use the first four digits of the serial number to determine the manufacture date.',
      source: 'Manufacturer Technical Specifications',
      yearMap: {  },
      monthMap: { '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September', '10': 'October', '11': 'November', '12': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var yy = serial.substring(0, 2);
      var mm = serial.substring(2, 4);
      if (!/^\d{2}$/.test(yy) || !/^\d{2}$/.test(mm)) return null;
      var yearNum = parseInt(yy, 10);
      var currentTwo = new Date().getFullYear() % 100;
      var fullYear = (yearNum > currentTwo ? 1900 : 2000) + yearNum;
      var m = this.monthMap[mm];
      return { year: String(fullYear), month: m || 'Month ' + mm, yearCode: yy, monthCode: mm };
    }
    },
    'amana': {
      name: 'Amana',
      parentManufacturer: 'Goodman Manufacturing Company',
      groupId: 'HVAC-1',
      products: 'Air Conditioner; Heat Pump; Furnace; Air Handler',
      serialEra: 'N/A',
      serialLengthNote: 'Serials typically start with 4 digits. Format: YYMM....',
      decodeMethod: 'Digits 1-2 (year), digits 3-4 (month). Source: Manufacturer Technical Specifications.',
      yearCodePosition: 'Digits 1-2',
      monthCodePosition: 'Digits 3-4',
      outputType: 'Month + Year',
      decodeNotes: 'First two digits represent the year and the next two digits represent the month.',
      exampleSerial: '1506XXXX',
      exampleResult: '15=2015 and 06=June -> June 2015',
      sources: 'goodmanmfg.com technical documentation; hvac-talk.com; acwholesalers.com',
      method: 'First two digits represent the year and the next two digits represent the month.',
      notes: 'Use the first four digits of the serial number to determine the manufacture date.',
      source: 'Manufacturer Technical Specifications',
      yearMap: {  },
      monthMap: { '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September', '10': 'October', '11': 'November', '12': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var yy = serial.substring(0, 2);
      var mm = serial.substring(2, 4);
      if (!/^\d{2}$/.test(yy) || !/^\d{2}$/.test(mm)) return null;
      var yearNum = parseInt(yy, 10);
      var currentTwo = new Date().getFullYear() % 100;
      var fullYear = (yearNum > currentTwo ? 1900 : 2000) + yearNum;
      var m = this.monthMap[mm];
      return { year: String(fullYear), month: m || 'Month ' + mm, yearCode: yy, monthCode: mm };
    }
    },
    'carrier': {
      name: 'Carrier',
      parentManufacturer: 'Carrier Global Corporation',
      groupId: 'HVAC-2',
      products: 'Air Conditioner; Heat Pump; Furnace; Air Handler',
      serialEra: 'N/A',
      serialLengthNote: 'Use digits 3-4 for year.',
      decodeMethod: 'Digits 3-4 (year). Source: Carrier service documentation.',
      yearCodePosition: 'Digits 3-4',
      monthCodePosition: 'N/A',
      outputType: 'Year',
      decodeNotes: 'Digits 3-4 represent the year.',
      exampleSerial: 'XX19XXXX',
      exampleResult: '19=2019',
      sources: 'hvac.com/carrier-age; homeinspectioninsider.com; carrier.com service guides',
      method: 'Digits 3-4 represent the year. Source: Manufacturer Technical Specifications.',
      notes: 'Use digits 3-4 of the serial number to determine the year.',
      source: 'Manufacturer Technical Specifications',
      yearMap: {  },
      monthMap: {  },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var yy = serial.substring(2, 4);
      if (!/^\d{2}$/.test(yy)) return null;
      var yearNum = parseInt(yy, 10);
      // Fixed threshold: no modern HVAC serial refers to years before 1950
      var fullYear = (yearNum <= 50 ? 2000 : 1900) + yearNum;
      return { year: String(fullYear), month: 'Year only', yearCode: yy };
    }
    },
    'bryant': {
      name: 'Bryant',
      parentManufacturer: 'Carrier Global Corporation',
      groupId: 'HVAC-2',
      products: 'Air Conditioner; Heat Pump; Furnace; Air Handler',
      serialEra: 'N/A',
      serialLengthNote: 'Serials start with 4 digits. Format: WWYY....',
      decodeMethod: 'Digits 1-2 (week), digits 3-4 (year). Source: Manufacturer Technical Specifications.',
      yearCodePosition: 'Digits 3-4',
      monthCodePosition: 'N/A',
      outputType: 'Week + Year',
      decodeNotes: 'First two digits represent production week; next two digits represent the year.',
      exampleSerial: '4519XXXX',
      exampleResult: '45=Week 45 and 19=2019 -> Week 45, 2019',
      sources: 'hvac.com age-lookup; homeinspectioninsider.com; manufacturer service guides',
      method: 'First two digits represent the production week; next two digits represent the year.',
      notes: 'Use the first four digits of the serial number to determine production week and year.',
      source: 'Manufacturer Technical Specifications',
      yearMap: {  },
      monthMap: {  },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var ww = serial.substring(0, 2);
      var yy = serial.substring(2, 4);
      if (!/^\d{2}$/.test(ww) || !/^\d{2}$/.test(yy)) return null;
      var week = parseInt(ww, 10);
      if (week < 1 || week > 53) return null;
      var yearNum = parseInt(yy, 10);
      // Fixed threshold: no modern HVAC serial refers to years before 1950
      var fullYear = (yearNum <= 50 ? 2000 : 1900) + yearNum;
      return { year: String(fullYear), month: 'Week ' + ww, yearCode: yy, weekDigits: ww };
    }
    },
    'payne': {
      name: 'Payne',
      parentManufacturer: 'Carrier Global Corporation',
      groupId: 'HVAC-2',
      products: 'Air Conditioner; Heat Pump; Furnace; Air Handler',
      serialEra: 'N/A',
      serialLengthNote: 'Serials start with 4 digits. Format: WWYY....',
      decodeMethod: 'Digits 1-2 (week), digits 3-4 (year). Source: Manufacturer Technical Specifications.',
      yearCodePosition: 'Digits 3-4',
      monthCodePosition: 'N/A',
      outputType: 'Week + Year',
      decodeNotes: 'First two digits represent production week; next two digits represent the year.',
      exampleSerial: '4519XXXX',
      exampleResult: '45=Week 45 and 19=2019 -> Week 45, 2019',
      sources: 'hvac.com age-lookup; homeinspectioninsider.com; manufacturer service guides',
      method: 'First two digits represent the production week; next two digits represent the year.',
      notes: 'Use the first four digits of the serial number to determine production week and year.',
      source: 'Manufacturer Technical Specifications',
      yearMap: {  },
      monthMap: {  },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var ww = serial.substring(0, 2);
      var yy = serial.substring(2, 4);
      if (!/^\d{2}$/.test(ww) || !/^\d{2}$/.test(yy)) return null;
      var week = parseInt(ww, 10);
      if (week < 1 || week > 53) return null;
      var yearNum = parseInt(yy, 10);
      // Fixed threshold: no modern HVAC serial refers to years before 1950
      var fullYear = (yearNum <= 50 ? 2000 : 1900) + yearNum;
      return { year: String(fullYear), month: 'Week ' + ww, yearCode: yy, weekDigits: ww };
    }
    },
    'rheem': {
      name: 'Rheem',
      parentManufacturer: 'Rheem Manufacturing',
      groupId: 'HVAC-3',
      products: 'Air Conditioner; Heat Pump; Furnace; Air Handler',
      serialEra: 'N/A',
      serialLengthNote: 'Contains a letter followed by 4 digits. Format: XWWYY....',
      decodeMethod: '4 digits following a letter (week + year). Source: Manufacturer Technical Specifications.',
      yearCodePosition: 'Digits 3-4 after letter',
      monthCodePosition: 'N/A',
      outputType: 'Week + Year',
      decodeNotes: 'Example: x4502x -> week 45 of 2002.',
      exampleSerial: 'X4502XXXX',
      exampleResult: '45=Week 45 and 02=2002 -> Week 45, 2002',
      sources: 'hvac.com age-lookup; homeinspectioninsider.com; rheem.com service guides',
      method: 'Four digits following a letter represent week and year (WWYY).',
      notes: 'Find the first letter followed by four digits in the serial number.',
      source: 'Manufacturer Technical Specifications',
      yearMap: {  },
      monthMap: {  },
      decode: function(serial) {
      if (!serial || serial.length < 5) return null;
      var match = serial.match(/[A-Za-z](\d{4})/);
      if (!match) return null;
      var digits = match[1];
      var ww = digits.substring(0, 2);
      var yy = digits.substring(2, 4);
      var week = parseInt(ww, 10);
      if (week < 1 || week > 53) return null;
      var yearNum = parseInt(yy, 10);
      // Fixed threshold: no modern HVAC serial refers to years before 1950
      var fullYear = (yearNum <= 50 ? 2000 : 1900) + yearNum;
      return { year: String(fullYear), month: 'Week ' + ww, yearCode: yy, weekDigits: ww };
    }
    },
    'ruud': {
      name: 'Ruud',
      parentManufacturer: 'Rheem Manufacturing',
      groupId: 'HVAC-3',
      products: 'Air Conditioner; Heat Pump; Furnace; Air Handler',
      serialEra: 'N/A',
      serialLengthNote: 'Contains a letter followed by 4 digits. Format: XWWYY....',
      decodeMethod: '4 digits following a letter (week + year). Source: Manufacturer Technical Specifications.',
      yearCodePosition: 'Digits 3-4 after letter',
      monthCodePosition: 'N/A',
      outputType: 'Week + Year',
      decodeNotes: 'Example: x4502x -> week 45 of 2002.',
      exampleSerial: 'X4502XXXX',
      exampleResult: '45=Week 45 and 02=2002 -> Week 45, 2002',
      sources: 'hvac.com age-lookup; homeinspectioninsider.com; rheem.com service guides',
      method: 'Four digits following a letter represent week and year (WWYY).',
      notes: 'Find the first letter followed by four digits in the serial number.',
      source: 'Manufacturer Technical Specifications',
      yearMap: {  },
      monthMap: {  },
      decode: function(serial) {
      if (!serial || serial.length < 5) return null;
      var match = serial.match(/[A-Za-z](\d{4})/);
      if (!match) return null;
      var digits = match[1];
      var ww = digits.substring(0, 2);
      var yy = digits.substring(2, 4);
      var week = parseInt(ww, 10);
      if (week < 1 || week > 53) return null;
      var yearNum = parseInt(yy, 10);
      // Fixed threshold: no modern HVAC serial refers to years before 1950
      var fullYear = (yearNum <= 50 ? 2000 : 1900) + yearNum;
      return { year: String(fullYear), month: 'Week ' + ww, yearCode: yy, weekDigits: ww };
    }
    },
    'trane': {
      name: 'Trane',
      parentManufacturer: 'Trane Technologies',
      groupId: 'HVAC-4',
      products: 'Air Conditioner; Heat Pump; Furnace; Air Handler',
      serialEra: 'N/A',
      serialLengthNote: 'Use digits 3-4 for year.',
      decodeMethod: 'Digits 3-4 (year). Source: Manufacturer Technical Specifications.',
      yearCodePosition: 'Digits 3-4',
      monthCodePosition: 'N/A',
      outputType: 'Year',
      decodeNotes: 'Digits 3-4 represent the year.',
      exampleSerial: 'XX19XXXX',
      exampleResult: '19=2019',
      sources: 'hvac.com age-lookup; homeinspectioninsider.com; trane.com service guides',
      method: 'Digits 3-4 represent the year.',
      notes: 'Use digits 3-4 of the serial number to determine the year.',
      source: 'Manufacturer Technical Specifications',
      yearMap: {  },
      monthMap: {  },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var yy = serial.substring(2, 4);
      if (!/^\d{2}$/.test(yy)) return null;
      var yearNum = parseInt(yy, 10);
      // Fixed threshold: no modern HVAC serial refers to years before 1950
      var fullYear = (yearNum <= 50 ? 2000 : 1900) + yearNum;
      return { year: String(fullYear), month: 'Year only', yearCode: yy };
    }
    },
    'american_standard': {
      name: 'American Standard',
      parentManufacturer: 'Trane Technologies',
      groupId: 'HVAC-4',
      products: 'Air Conditioner; Heat Pump; Furnace; Air Handler',
      serialEra: 'N/A',
      serialLengthNote: 'Use digits 3-4 for year.',
      decodeMethod: 'Digits 3-4 (year). Source: Manufacturer Technical Specifications.',
      yearCodePosition: 'Digits 3-4',
      monthCodePosition: 'N/A',
      outputType: 'Year',
      decodeNotes: 'Digits 3-4 represent the year.',
      exampleSerial: 'XX19XXXX',
      exampleResult: '19=2019',
      sources: 'hvac.com age-lookup; homeinspectioninsider.com; trane.com service guides',
      method: 'Digits 3-4 represent the year.',
      notes: 'Use digits 3-4 of the serial number to determine the year.',
      source: 'Manufacturer Technical Specifications',
      yearMap: {  },
      monthMap: {  },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var yy = serial.substring(2, 4);
      if (!/^\d{2}$/.test(yy)) return null;
      var yearNum = parseInt(yy, 10);
      // Fixed threshold: no modern HVAC serial refers to years before 1950
      var fullYear = (yearNum <= 50 ? 2000 : 1900) + yearNum;
      return { year: String(fullYear), month: 'Year only', yearCode: yy };
    }
    },
    'lennox': {
      name: 'Lennox',
      parentManufacturer: 'Lennox International Inc.',
      groupId: 'HVAC-4',
      products: 'Air Conditioner; Heat Pump; Furnace; Air Handler',
      serialEra: 'N/A',
      serialLengthNote: 'Serials start with 4 digits. Format: WWYY....',
      decodeMethod: 'Digits 1-2 (week), digits 3-4 (year). Source: Manufacturer Technical Specifications.',
      yearCodePosition: 'Digits 3-4',
      monthCodePosition: 'N/A',
      outputType: 'Week + Year',
      decodeNotes: 'First two digits represent production week; next two digits represent the year.',
      exampleSerial: '4519XXXX',
      exampleResult: '45=Week 45 and 19=2019 -> Week 45, 2019',
      sources: 'hvac.com age-lookup; homeinspectioninsider.com; manufacturer service guides',
      method: 'First two digits represent the production week; next two digits represent the year.',
      notes: 'Use the first four digits of the serial number to determine production week and year.',
      source: 'Manufacturer Technical Specifications',
      yearMap: {  },
      monthMap: {  },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var ww = serial.substring(0, 2);
      var yy = serial.substring(2, 4);
      if (!/^\d{2}$/.test(ww) || !/^\d{2}$/.test(yy)) return null;
      var week = parseInt(ww, 10);
      if (week < 1 || week > 53) return null;
      var yearNum = parseInt(yy, 10);
      // Fixed threshold: no modern HVAC serial refers to years before 1950
      var fullYear = (yearNum <= 50 ? 2000 : 1900) + yearNum;
      return { year: String(fullYear), month: 'Week ' + ww, yearCode: yy, weekDigits: ww };
    }
    },
    'york': {
      name: 'York',
      parentManufacturer: 'Johnson Controls',
      groupId: 'HVAC-4',
      products: 'Air Conditioner; Heat Pump; Furnace; Air Handler',
      serialEra: 'N/A',
      serialLengthNote: 'Serials start with 4 digits. Format: WWYY....',
      decodeMethod: 'Digits 1-2 (week), digits 3-4 (year). Source: Manufacturer Technical Specifications.',
      yearCodePosition: 'Digits 3-4',
      monthCodePosition: 'N/A',
      outputType: 'Week + Year',
      decodeNotes: 'First two digits represent production week; next two digits represent the year.',
      exampleSerial: '4519XXXX',
      exampleResult: '45=Week 45 and 19=2019 -> Week 45, 2019',
      sources: 'hvac.com age-lookup; homeinspectioninsider.com; manufacturer service guides',
      method: 'First two digits represent the production week; next two digits represent the year.',
      notes: 'Use the first four digits of the serial number to determine production week and year.',
      source: 'Manufacturer Technical Specifications',
      yearMap: {  },
      monthMap: {  },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var ww = serial.substring(0, 2);
      var yy = serial.substring(2, 4);
      if (!/^\d{2}$/.test(ww) || !/^\d{2}$/.test(yy)) return null;
      var week = parseInt(ww, 10);
      if (week < 1 || week > 53) return null;
      var yearNum = parseInt(yy, 10);
      // Fixed threshold: no modern HVAC serial refers to years before 1950
      var fullYear = (yearNum <= 50 ? 2000 : 1900) + yearNum;
      return { year: String(fullYear), month: 'Week ' + ww, yearCode: yy, weekDigits: ww };
    }
    }
    }
  };
  global.decoderData = global.decoderData || {};
  global.decoderData.hvac = categoryData;
})(window);
