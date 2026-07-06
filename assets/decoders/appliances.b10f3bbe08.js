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
      { id: 'admiral_post_2006', name: 'Admiral (post-2006)' },
      { id: 'admiral_pre_2006', name: 'Admiral (pre-2006)' },
      { id: 'amana_post_2006', name: 'Amana (post-2006)' },
      { id: 'amana_pre_2006', name: 'Amana (pre-2006)' },
      { id: 'bosch', name: 'Bosch' },
      { id: 'crosley', name: 'Crosley' },
      { id: 'electrolux', name: 'Electrolux' },
      { id: 'estate', name: 'Estate' },
      { id: 'frigidaire', name: 'Frigidaire' },
      { id: 'gaggenau', name: 'Gaggenau' },
      { id: 'ge', name: 'GE' },
      { id: 'cafe', name: 'Cafe' },
      { id: 'ge_profile', name: 'GE Profile' },
      { id: 'ge_monogram', name: 'GE Monogram' },
      { id: 'hotpoint', name: 'Hotpoint' },
      { id: 'rca', name: 'RCA' },
      { id: 'gibson', name: 'Gibson' },
      { id: 'inglis', name: 'Inglis' },
      { id: 'jenn_air_post_2006', name: 'Jenn-Air (post-2006)' },
      { id: 'jenn_air_pre_2006', name: 'Jenn-Air (pre-2006)' },
      { id: 'kelvinator', name: 'Kelvinator' },
      { id: 'kenmore', name: 'Kenmore' },
      { id: 'kitchenaid', name: 'KitchenAid' },
      { id: 'norcold', name: 'Norcold' },
      { id: 'sub_zero', name: 'Sub-Zero' },
      { id: 'hampton_bay', name: 'Hampton Bay' },
      { id: 'conquest', name: 'Conquest' },
      { id: 'coolerator', name: 'Coolerator' },
      { id: 'crystal_tips', name: 'Crystal Tips' },
      { id: 'partners_plus', name: 'Partners Plus' },
      { id: 'jordan', name: 'Jordan' },
      { id: 'sinkguard', name: 'SinkGuard' },
      { id: 'caloric', name: 'Caloric' },
      { id: 'hardwick', name: 'Hardwick' },
      { id: 'norge', name: 'Norge' },
      { id: 'speed_queen', name: 'Speed Queen' },
      { id: 'magic_chef', name: 'Magic Chef' },
      { id: 'modern_maid', name: 'Modern Maid' },
      { id: 'glenwood', name: 'Glenwood' },
      { id: 'sunray', name: 'Sunray' },
      { id: 'litton', name: 'Litton' },
      { id: 'menumaster', name: 'Menumaster' },
      { id: 'bravos', name: 'Bravos' },
      { id: 'maycor', name: 'Maycor' },
      { id: 'neptune', name: 'Neptune' },
      { id: 'imperial', name: 'Imperial' },
      { id: 'philco', name: 'Philco' },
      { id: 'lg', name: 'LG' },
      { id: 'maytag_post_2006', name: 'Maytag (post-2006)' },
      { id: 'maytag_pre_2006', name: 'Maytag (pre-2006)' },
      { id: 'roper', name: 'Roper' },
      { id: 'samsung', name: 'Samsung' },
      { id: 'tappan', name: 'Tappan' },
      { id: 'thermador', name: 'Thermador' },
      { id: 'whirlpool', name: 'Whirlpool' },
      { id: 'white_consolidated_industries_wci', name: 'White Consolidated Industries (WCI)' },
      { id: 'white_westinghouse', name: 'White-Westinghouse' }
    ],
    decoders: {
    'whirlpool': {
      name: 'Whirlpool',
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      decodeMethod: 'Second character (nine-character serial number) or third character (ten-character serial number)',
      yearCodePosition: 'Second character (nine-character serial number) or third character (ten-character serial number)',
      monthCodePosition: 'N/A',
      outputType: 'Year + Week of Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      source: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      patterns: [
        { name: '9-char alphanumeric', length: 9, mask: '**##*****', notes: 'Week digits are characters 3-4.' },
        { name: '10-char alphanumeric', length: 10, mask: '***##*****', notes: 'Week digits are characters 4-5.' }
      ],
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
            decode: function(serial) {
      return decodeWhirlpoolFamilyByLength(serial, this.yearMap);
    }
    },
    'norcold': {
      name: 'Norcold',
      parentManufacturer: 'Thetford Corporation (Norcold Division)',
      groupId: 'UNVERIFIED',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: 'Second alpha character = year code (letters only).',
      decodeMethod: 'Second alpha character = year code',
      yearCodePosition: 'Second alpha character',
      monthCodePosition: 'N/A',
      outputType: 'Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Second alpha character = year code',
      notes: 'WARNING: Norcold is manufactured by Thetford Corporation, not Whirlpool. The Whirlpool serial decode method applied here is UNVERIFIED for Norcold RV refrigerators. Results should be treated as estimates only. Verify using Norcold service documentation.',
      source: 'UNVERIFIED -- Norcold (Thetford Corp) serial format documentation needed',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      if (!serial) return null;
      var letters = String(serial).match(/[A-Za-z]/g) || [];
      if (letters.length < 2) return null;
      var yearChar = letters[1].toUpperCase();
      var y = this.yearMap[yearChar];
      return { year: y || 'Unknown code: ' + yearChar, month: 'N/A', yearCode: yearChar };
    }
    },
    'sub_zero': {
      name: 'Sub-Zero',
      parentManufacturer: 'Sub-Zero Group, Inc. (independent)',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: 'Second character = year code for alphanumeric serials; fallback to second alpha character for legacy letter-heavy serials.',
      decodeMethod: 'Second character = year code (fallback: second alpha character)',
      yearCodePosition: 'Second character (fallback: second alpha character)',
      monthCodePosition: 'N/A',
      outputType: 'Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped. Some valid Sub-Zero serials use the second character overall as the year code even when it is numeric.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Second character = year code (fallback: second alpha character)',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped. Some valid Sub-Zero serials use the second character overall as the year code even when it is numeric.',
      source: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      if (!serial) return null;
      var normalized = String(serial).trim().toUpperCase();
      if (normalized.length < 2) return null;
      var yearChar = normalized.charAt(1);
      if (!this.yearMap[yearChar]) {
        var letters = normalized.match(/[A-Z]/g) || [];
        if (letters.length < 2) return null;
        yearChar = letters[1];
      }
      var y = this.yearMap[yearChar];
      return { year: y || 'Unknown code: ' + yearChar, month: 'N/A', yearCode: yearChar };
    }
    },
    'hampton_bay': {
      name: 'Hampton Bay',
      parentManufacturer: 'Home Depot (private label -- fans/lighting, NOT major appliances)',
      groupId: 'UNVERIFIED',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: 'Second alpha character = year code (letters only).',
      decodeMethod: 'Second alpha character = year code',
      yearCodePosition: 'Second alpha character',
      monthCodePosition: 'N/A',
      outputType: 'Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Second alpha character = year code',
      notes: 'WARNING: Hampton Bay is a Home Depot private-label brand for fans and lighting, NOT a major appliance brand under Whirlpool. Applying Whirlpool serial decoding to Hampton Bay products is UNVERIFIED. Results should be treated as estimates only.',
      source: 'UNVERIFIED -- Hampton Bay is a fan/lighting brand; no appliance serial documentation found',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      if (!serial) return null;
      var letters = String(serial).match(/[A-Za-z]/g) || [];
      if (letters.length < 2) return null;
      var yearChar = letters[1].toUpperCase();
      var y = this.yearMap[yearChar];
      return { year: y || 'Unknown code: ' + yearChar, month: 'N/A', yearCode: yearChar };
    }
    },
    'conquest': {
      name: 'Conquest',
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: 'Second alpha character = year code (letters only).',
      decodeMethod: 'Second alpha character = year code',
      yearCodePosition: 'Second alpha character',
      monthCodePosition: 'N/A',
      outputType: 'Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Second alpha character = year code',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      source: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      if (!serial) return null;
      var letters = String(serial).match(/[A-Za-z]/g) || [];
      if (letters.length < 2) return null;
      var yearChar = letters[1].toUpperCase();
      var y = this.yearMap[yearChar];
      return { year: y || 'Unknown code: ' + yearChar, month: 'N/A', yearCode: yearChar };
    }
    },
    'coolerator': {
      name: 'Coolerator',
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: 'Second alpha character = year code (letters only).',
      decodeMethod: 'Second alpha character = year code',
      yearCodePosition: 'Second alpha character',
      monthCodePosition: 'N/A',
      outputType: 'Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Second alpha character = year code',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      source: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      if (!serial) return null;
      var letters = String(serial).match(/[A-Za-z]/g) || [];
      if (letters.length < 2) return null;
      var yearChar = letters[1].toUpperCase();
      var y = this.yearMap[yearChar];
      return { year: y || 'Unknown code: ' + yearChar, month: 'N/A', yearCode: yearChar };
    }
    },
    'crystal_tips': {
      name: 'Crystal Tips',
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: 'Second alpha character = year code (letters only).',
      decodeMethod: 'Second alpha character = year code',
      yearCodePosition: 'Second alpha character',
      monthCodePosition: 'N/A',
      outputType: 'Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Second alpha character = year code',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      source: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      if (!serial) return null;
      var letters = String(serial).match(/[A-Za-z]/g) || [];
      if (letters.length < 2) return null;
      var yearChar = letters[1].toUpperCase();
      var y = this.yearMap[yearChar];
      return { year: y || 'Unknown code: ' + yearChar, month: 'N/A', yearCode: yearChar };
    }
    },
    'partners_plus': {
      name: 'Partners Plus',
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: 'Second alpha character = year code (letters only).',
      decodeMethod: 'Second alpha character = year code',
      yearCodePosition: 'Second alpha character',
      monthCodePosition: 'N/A',
      outputType: 'Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Second alpha character = year code',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      source: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      if (!serial) return null;
      var letters = String(serial).match(/[A-Za-z]/g) || [];
      if (letters.length < 2) return null;
      var yearChar = letters[1].toUpperCase();
      var y = this.yearMap[yearChar];
      return { year: y || 'Unknown code: ' + yearChar, month: 'N/A', yearCode: yearChar };
    }
    },
    'jordan': {
      name: 'Jordan',
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: 'Second alpha character = year code (letters only).',
      decodeMethod: 'Second alpha character = year code',
      yearCodePosition: 'Second alpha character',
      monthCodePosition: 'N/A',
      outputType: 'Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Second alpha character = year code',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      source: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      if (!serial) return null;
      var letters = String(serial).match(/[A-Za-z]/g) || [];
      if (letters.length < 2) return null;
      var yearChar = letters[1].toUpperCase();
      var y = this.yearMap[yearChar];
      return { year: y || 'Unknown code: ' + yearChar, month: 'N/A', yearCode: yearChar };
    }
    },
    'sinkguard': {
      name: 'SinkGuard',
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: 'Second alpha character = year code (letters only).',
      decodeMethod: 'Second alpha character = year code',
      yearCodePosition: 'Second alpha character',
      monthCodePosition: 'N/A',
      outputType: 'Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Second alpha character = year code',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      source: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      if (!serial) return null;
      var letters = String(serial).match(/[A-Za-z]/g) || [];
      if (letters.length < 2) return null;
      var yearChar = letters[1].toUpperCase();
      var y = this.yearMap[yearChar];
      return { year: y || 'Unknown code: ' + yearChar, month: 'N/A', yearCode: yearChar };
    }
    },
    'kitchenaid': {
      name: 'KitchenAid',
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      decodeMethod: 'Second character (nine-character serial number) or third character (ten-character serial number)',
      yearCodePosition: 'Second character (nine-character serial number) or third character (ten-character serial number)',
      monthCodePosition: 'N/A',
      outputType: 'Year + Week of Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      source: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      return decodeWhirlpoolFamilyByLength(serial, this.yearMap);
    }
    },
    'roper': {
      name: 'Roper',
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      decodeMethod: 'Second character (nine-character serial number) or third character (ten-character serial number)',
      yearCodePosition: 'Second character (nine-character serial number) or third character (ten-character serial number)',
      monthCodePosition: 'N/A',
      outputType: 'Year + Week of Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      source: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      return decodeWhirlpoolFamilyByLength(serial, this.yearMap);
    }
    },
    'estate': {
      name: 'Estate',
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      decodeMethod: 'Second character (nine-character serial number) or third character (ten-character serial number)',
      yearCodePosition: 'Second character (nine-character serial number) or third character (ten-character serial number)',
      monthCodePosition: 'N/A',
      outputType: 'Year + Week of Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      source: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      return decodeWhirlpoolFamilyByLength(serial, this.yearMap);
    }
    },
    'inglis': {
      name: 'Inglis',
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      decodeMethod: 'Second character (nine-character serial number) or third character (ten-character serial number)',
      yearCodePosition: 'Second character (nine-character serial number) or third character (ten-character serial number)',
      monthCodePosition: 'N/A',
      outputType: 'Year + Week of Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      source: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      return decodeWhirlpoolFamilyByLength(serial, this.yearMap);
    }
    },
    'crosley': {
      name: 'Crosley',
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      decodeMethod: 'Second character (nine-character serial number) or third character (ten-character serial number)',
      yearCodePosition: 'Second character (nine-character serial number) or third character (ten-character serial number)',
      monthCodePosition: 'N/A',
      outputType: 'Year + Week of Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      source: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      return decodeWhirlpoolFamilyByLength(serial, this.yearMap);
    }
    },
    'maytag_post_2006': {
      name: 'Maytag (post-2006)',
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      decodeMethod: 'Second character (nine-character serial) or third character (ten-character serial)',
      yearCodePosition: 'Second character (nine-character serial number) or third character (ten-character serial number)',
      monthCodePosition: 'N/A',
      outputType: 'Year + Week of Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022, Week 25',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      source: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      return decodeWhirlpoolFamilyByLength(serial, this.yearMap);
    }
    },
    'jenn_air_post_2006': {
      name: 'Jenn-Air (post-2006)',
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      decodeMethod: 'Second character (nine-character serial) or third character (ten-character serial)',
      yearCodePosition: 'Second character (nine-character serial number) or third character (ten-character serial number)',
      monthCodePosition: 'N/A',
      outputType: 'Year + Week of Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022, Week 25',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      source: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      return decodeWhirlpoolFamilyByLength(serial, this.yearMap);
    }
    },
    'amana_post_2006': {
      name: 'Amana (post-2006)',
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      decodeMethod: 'Second character (nine-character serial) or third character (ten-character serial)',
      yearCodePosition: 'Second character (nine-character serial number) or third character (ten-character serial number)',
      monthCodePosition: 'N/A',
      outputType: 'Year + Week of Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022, Week 25',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      source: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      return decodeWhirlpoolFamilyByLength(serial, this.yearMap);
    }
    },
    'admiral_post_2006': {
      name: 'Admiral (post-2006)',
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      decodeMethod: 'Second character (nine-character serial) or third character (ten-character serial)',
      yearCodePosition: 'Second character (nine-character serial number) or third character (ten-character serial number)',
      monthCodePosition: 'N/A',
      outputType: 'Year + Week of Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022, Week 25',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I N O Q V are skipped.',
      source: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      return decodeWhirlpoolFamilyByLength(serial, this.yearMap);
    }
    },
    'maytag_pre_2006': {
      name: 'Maytag (pre-2006)',
      parentManufacturer: 'Whirlpool Corporation (legacy Maytag)',
      groupId: '1B',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: 'Pre-2006',
      serialLengthNote: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      decodeMethod: 'Second-to-last character of serial',
      yearCodePosition: 'Second-to-last character of serial',
      monthCodePosition: 'Last character of serial',
      outputType: 'Month + Year',
      decodeNotes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      exampleSerial: '(any serial ending in NC)',
      exampleResult: 'N=1984/2008/2020 + C=March',
      sources: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      method: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      notes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      source: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      yearMap: { 'C': '1975/1987/1999/2011', 'E': '1977/1989/2001/2013', 'G': '1979/1991/2003/2015', 'H': '1980/1992/2004/2016', 'L': '1982/1994/2006/2018', 'M': '1983/1995/2007/2019', 'N': '1984/1996/2008/2020', 'R': '1985/1997/2009/2021', 'S': '1986/1998/2010/2022', 'T': '1987/1999/2011/2023', 'U': '1988/2000/2012/2024', 'V': '1989/2001/2013/2025' },
      monthMap: { 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'L': 'September', 'M': 'October', 'N': 'November', 'R': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 2) return null;
      var yearChar = serial[serial.length - 2].toUpperCase();
      var monthChar = serial[serial.length - 1].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar, yearCode: yearChar, monthCode: monthChar };
    }
    },
    'caloric': {
      name: 'Caloric',
      parentManufacturer: 'Whirlpool Corporation (legacy Maytag)',
      groupId: '1B',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: 'Pre-2006',
      serialLengthNote: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      decodeMethod: 'Second-to-last character of serial',
      yearCodePosition: 'Second-to-last character of serial',
      monthCodePosition: 'Last character of serial',
      outputType: 'Month + Year',
      decodeNotes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      exampleSerial: '(any serial ending in NC)',
      exampleResult: 'N=1984/2008/2020 + C=March',
      sources: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      method: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      notes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      source: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      yearMap: { 'C': '1975/1987/1999/2011', 'E': '1977/1989/2001/2013', 'G': '1979/1991/2003/2015', 'H': '1980/1992/2004/2016', 'L': '1982/1994/2006/2018', 'M': '1983/1995/2007/2019', 'N': '1984/1996/2008/2020', 'R': '1985/1997/2009/2021', 'S': '1986/1998/2010/2022', 'T': '1987/1999/2011/2023', 'U': '1988/2000/2012/2024', 'V': '1989/2001/2013/2025' },
      monthMap: { 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'L': 'September', 'M': 'October', 'N': 'November', 'R': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 2) return null;
      var yearChar = serial[serial.length - 2].toUpperCase();
      var monthChar = serial[serial.length - 1].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar, yearCode: yearChar, monthCode: monthChar };
    }
    },
    'hardwick': {
      name: 'Hardwick',
      parentManufacturer: 'Whirlpool Corporation (legacy Maytag)',
      groupId: '1B',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: 'Pre-2006',
      serialLengthNote: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      decodeMethod: 'Second-to-last character of serial',
      yearCodePosition: 'Second-to-last character of serial',
      monthCodePosition: 'Last character of serial',
      outputType: 'Month + Year',
      decodeNotes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      exampleSerial: '(any serial ending in NC)',
      exampleResult: 'N=1984/2008/2020 + C=March',
      sources: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      method: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      notes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      source: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      yearMap: { 'C': '1975/1987/1999/2011', 'E': '1977/1989/2001/2013', 'G': '1979/1991/2003/2015', 'H': '1980/1992/2004/2016', 'L': '1982/1994/2006/2018', 'M': '1983/1995/2007/2019', 'N': '1984/1996/2008/2020', 'R': '1985/1997/2009/2021', 'S': '1986/1998/2010/2022', 'T': '1987/1999/2011/2023', 'U': '1988/2000/2012/2024', 'V': '1989/2001/2013/2025' },
      monthMap: { 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'L': 'September', 'M': 'October', 'N': 'November', 'R': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 2) return null;
      var yearChar = serial[serial.length - 2].toUpperCase();
      var monthChar = serial[serial.length - 1].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar, yearCode: yearChar, monthCode: monthChar };
    }
    },
    'norge': {
      name: 'Norge',
      parentManufacturer: 'Whirlpool Corporation (legacy Maytag)',
      groupId: '1B',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: 'Pre-2006',
      serialLengthNote: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      decodeMethod: 'Second-to-last character of serial',
      yearCodePosition: 'Second-to-last character of serial',
      monthCodePosition: 'Last character of serial',
      outputType: 'Month + Year',
      decodeNotes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      exampleSerial: '(any serial ending in NC)',
      exampleResult: 'N=1984/2008/2020 + C=March',
      sources: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      method: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      notes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      source: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      yearMap: { 'C': '1975/1987/1999/2011', 'E': '1977/1989/2001/2013', 'G': '1979/1991/2003/2015', 'H': '1980/1992/2004/2016', 'L': '1982/1994/2006/2018', 'M': '1983/1995/2007/2019', 'N': '1984/1996/2008/2020', 'R': '1985/1997/2009/2021', 'S': '1986/1998/2010/2022', 'T': '1987/1999/2011/2023', 'U': '1988/2000/2012/2024', 'V': '1989/2001/2013/2025' },
      monthMap: { 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'L': 'September', 'M': 'October', 'N': 'November', 'R': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 2) return null;
      var yearChar = serial[serial.length - 2].toUpperCase();
      var monthChar = serial[serial.length - 1].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar, yearCode: yearChar, monthCode: monthChar };
    }
    },
    'speed_queen': {
      name: 'Speed Queen',
      parentManufacturer: 'Whirlpool Corporation (legacy Maytag)',
      groupId: '1B',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: 'Pre-2006',
      serialLengthNote: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      decodeMethod: 'Second-to-last character of serial',
      yearCodePosition: 'Second-to-last character of serial',
      monthCodePosition: 'Last character of serial',
      outputType: 'Month + Year',
      decodeNotes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      exampleSerial: '(any serial ending in NC)',
      exampleResult: 'N=1984/2008/2020 + C=March',
      sources: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      method: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      notes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      source: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      yearMap: { 'C': '1975/1987/1999/2011', 'E': '1977/1989/2001/2013', 'G': '1979/1991/2003/2015', 'H': '1980/1992/2004/2016', 'L': '1982/1994/2006/2018', 'M': '1983/1995/2007/2019', 'N': '1984/1996/2008/2020', 'R': '1985/1997/2009/2021', 'S': '1986/1998/2010/2022', 'T': '1987/1999/2011/2023', 'U': '1988/2000/2012/2024', 'V': '1989/2001/2013/2025' },
      monthMap: { 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'L': 'September', 'M': 'October', 'N': 'November', 'R': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 2) return null;
      var yearChar = serial[serial.length - 2].toUpperCase();
      var monthChar = serial[serial.length - 1].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar, yearCode: yearChar, monthCode: monthChar };
    }
    },
    'magic_chef': {
      name: 'Magic Chef',
      parentManufacturer: 'Whirlpool Corporation (legacy Maytag)',
      groupId: '1B',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: 'Pre-2006',
      serialLengthNote: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      decodeMethod: 'Second-to-last character of serial',
      yearCodePosition: 'Second-to-last character of serial',
      monthCodePosition: 'Last character of serial',
      outputType: 'Month + Year',
      decodeNotes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      exampleSerial: '(any serial ending in NC)',
      exampleResult: 'N=1984/2008/2020 + C=March',
      sources: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      method: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      notes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      source: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      yearMap: { 'C': '1975/1987/1999/2011', 'E': '1977/1989/2001/2013', 'G': '1979/1991/2003/2015', 'H': '1980/1992/2004/2016', 'L': '1982/1994/2006/2018', 'M': '1983/1995/2007/2019', 'N': '1984/1996/2008/2020', 'R': '1985/1997/2009/2021', 'S': '1986/1998/2010/2022', 'T': '1987/1999/2011/2023', 'U': '1988/2000/2012/2024', 'V': '1989/2001/2013/2025' },
      monthMap: { 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'L': 'September', 'M': 'October', 'N': 'November', 'R': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 2) return null;
      var yearChar = serial[serial.length - 2].toUpperCase();
      var monthChar = serial[serial.length - 1].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar, yearCode: yearChar, monthCode: monthChar };
    }
    },
    'modern_maid': {
      name: 'Modern Maid',
      parentManufacturer: 'Whirlpool Corporation (legacy Maytag)',
      groupId: '1B',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: 'Pre-2006',
      serialLengthNote: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      decodeMethod: 'Second-to-last character of serial',
      yearCodePosition: 'Second-to-last character of serial',
      monthCodePosition: 'Last character of serial',
      outputType: 'Month + Year',
      decodeNotes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      exampleSerial: '(any serial ending in NC)',
      exampleResult: 'N=1984/2008/2020 + C=March',
      sources: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      method: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      notes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      source: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      yearMap: { 'C': '1975/1987/1999/2011', 'E': '1977/1989/2001/2013', 'G': '1979/1991/2003/2015', 'H': '1980/1992/2004/2016', 'L': '1982/1994/2006/2018', 'M': '1983/1995/2007/2019', 'N': '1984/1996/2008/2020', 'R': '1985/1997/2009/2021', 'S': '1986/1998/2010/2022', 'T': '1987/1999/2011/2023', 'U': '1988/2000/2012/2024', 'V': '1989/2001/2013/2025' },
      monthMap: { 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'L': 'September', 'M': 'October', 'N': 'November', 'R': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 2) return null;
      var yearChar = serial[serial.length - 2].toUpperCase();
      var monthChar = serial[serial.length - 1].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar, yearCode: yearChar, monthCode: monthChar };
    }
    },
    'glenwood': {
      name: 'Glenwood',
      parentManufacturer: 'Whirlpool Corporation (legacy Maytag)',
      groupId: '1B',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: 'Pre-2006',
      serialLengthNote: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      decodeMethod: 'Second-to-last character of serial',
      yearCodePosition: 'Second-to-last character of serial',
      monthCodePosition: 'Last character of serial',
      outputType: 'Month + Year',
      decodeNotes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      exampleSerial: '(any serial ending in NC)',
      exampleResult: 'N=1984/2008/2020 + C=March',
      sources: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      method: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      notes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      source: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      yearMap: { 'C': '1975/1987/1999/2011', 'E': '1977/1989/2001/2013', 'G': '1979/1991/2003/2015', 'H': '1980/1992/2004/2016', 'L': '1982/1994/2006/2018', 'M': '1983/1995/2007/2019', 'N': '1984/1996/2008/2020', 'R': '1985/1997/2009/2021', 'S': '1986/1998/2010/2022', 'T': '1987/1999/2011/2023', 'U': '1988/2000/2012/2024', 'V': '1989/2001/2013/2025' },
      monthMap: { 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'L': 'September', 'M': 'October', 'N': 'November', 'R': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 2) return null;
      var yearChar = serial[serial.length - 2].toUpperCase();
      var monthChar = serial[serial.length - 1].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar, yearCode: yearChar, monthCode: monthChar };
    }
    },
    'sunray': {
      name: 'Sunray',
      parentManufacturer: 'Whirlpool Corporation (legacy Maytag)',
      groupId: '1B',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: 'Pre-2006',
      serialLengthNote: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      decodeMethod: 'Second-to-last character of serial',
      yearCodePosition: 'Second-to-last character of serial',
      monthCodePosition: 'Last character of serial',
      outputType: 'Month + Year',
      decodeNotes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      exampleSerial: '(any serial ending in NC)',
      exampleResult: 'N=1984/2008/2020 + C=March',
      sources: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      method: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      notes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      source: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      yearMap: { 'C': '1975/1987/1999/2011', 'E': '1977/1989/2001/2013', 'G': '1979/1991/2003/2015', 'H': '1980/1992/2004/2016', 'L': '1982/1994/2006/2018', 'M': '1983/1995/2007/2019', 'N': '1984/1996/2008/2020', 'R': '1985/1997/2009/2021', 'S': '1986/1998/2010/2022', 'T': '1987/1999/2011/2023', 'U': '1988/2000/2012/2024', 'V': '1989/2001/2013/2025' },
      monthMap: { 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'L': 'September', 'M': 'October', 'N': 'November', 'R': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 2) return null;
      var yearChar = serial[serial.length - 2].toUpperCase();
      var monthChar = serial[serial.length - 1].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar, yearCode: yearChar, monthCode: monthChar };
    }
    },
    'litton': {
      name: 'Litton',
      parentManufacturer: 'Whirlpool Corporation (legacy Maytag)',
      groupId: '1B',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: 'Pre-2006',
      serialLengthNote: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      decodeMethod: 'Second-to-last character of serial',
      yearCodePosition: 'Second-to-last character of serial',
      monthCodePosition: 'Last character of serial',
      outputType: 'Month + Year',
      decodeNotes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      exampleSerial: '(any serial ending in NC)',
      exampleResult: 'N=1984/2008/2020 + C=March',
      sources: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      method: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      notes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      source: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      yearMap: { 'C': '1975/1987/1999/2011', 'E': '1977/1989/2001/2013', 'G': '1979/1991/2003/2015', 'H': '1980/1992/2004/2016', 'L': '1982/1994/2006/2018', 'M': '1983/1995/2007/2019', 'N': '1984/1996/2008/2020', 'R': '1985/1997/2009/2021', 'S': '1986/1998/2010/2022', 'T': '1987/1999/2011/2023', 'U': '1988/2000/2012/2024', 'V': '1989/2001/2013/2025' },
      monthMap: { 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'L': 'September', 'M': 'October', 'N': 'November', 'R': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 2) return null;
      var yearChar = serial[serial.length - 2].toUpperCase();
      var monthChar = serial[serial.length - 1].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar, yearCode: yearChar, monthCode: monthChar };
    }
    },
    'menumaster': {
      name: 'Menumaster',
      parentManufacturer: 'Whirlpool Corporation (legacy Maytag)',
      groupId: '1B',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: 'Pre-2006',
      serialLengthNote: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      decodeMethod: 'Second-to-last character of serial',
      yearCodePosition: 'Second-to-last character of serial',
      monthCodePosition: 'Last character of serial',
      outputType: 'Month + Year',
      decodeNotes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      exampleSerial: '(any serial ending in NC)',
      exampleResult: 'N=1984/2008/2020 + C=March',
      sources: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      method: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      notes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      source: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      yearMap: { 'C': '1975/1987/1999/2011', 'E': '1977/1989/2001/2013', 'G': '1979/1991/2003/2015', 'H': '1980/1992/2004/2016', 'L': '1982/1994/2006/2018', 'M': '1983/1995/2007/2019', 'N': '1984/1996/2008/2020', 'R': '1985/1997/2009/2021', 'S': '1986/1998/2010/2022', 'T': '1987/1999/2011/2023', 'U': '1988/2000/2012/2024', 'V': '1989/2001/2013/2025' },
      monthMap: { 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'L': 'September', 'M': 'October', 'N': 'November', 'R': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 2) return null;
      var yearChar = serial[serial.length - 2].toUpperCase();
      var monthChar = serial[serial.length - 1].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar, yearCode: yearChar, monthCode: monthChar };
    }
    },
    'bravos': {
      name: 'Bravos',
      parentManufacturer: 'Whirlpool Corporation (legacy Maytag)',
      groupId: '1B',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: 'Pre-2006',
      serialLengthNote: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      decodeMethod: 'Second-to-last character of serial',
      yearCodePosition: 'Second-to-last character of serial',
      monthCodePosition: 'Last character of serial',
      outputType: 'Month + Year',
      decodeNotes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      exampleSerial: '(any serial ending in NC)',
      exampleResult: 'N=1984/2008/2020 + C=March',
      sources: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      method: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      notes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      source: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      yearMap: { 'C': '1975/1987/1999/2011', 'E': '1977/1989/2001/2013', 'G': '1979/1991/2003/2015', 'H': '1980/1992/2004/2016', 'L': '1982/1994/2006/2018', 'M': '1983/1995/2007/2019', 'N': '1984/1996/2008/2020', 'R': '1985/1997/2009/2021', 'S': '1986/1998/2010/2022', 'T': '1987/1999/2011/2023', 'U': '1988/2000/2012/2024', 'V': '1989/2001/2013/2025' },
      monthMap: { 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'L': 'September', 'M': 'October', 'N': 'November', 'R': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 2) return null;
      var yearChar = serial[serial.length - 2].toUpperCase();
      var monthChar = serial[serial.length - 1].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar, yearCode: yearChar, monthCode: monthChar };
    }
    },
    'maycor': {
      name: 'Maycor',
      parentManufacturer: 'Whirlpool Corporation (legacy Maytag)',
      groupId: '1B',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: 'Pre-2006',
      serialLengthNote: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      decodeMethod: 'Second-to-last character of serial',
      yearCodePosition: 'Second-to-last character of serial',
      monthCodePosition: 'Last character of serial',
      outputType: 'Month + Year',
      decodeNotes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      exampleSerial: '(any serial ending in NC)',
      exampleResult: 'N=1984/2008/2020 + C=March',
      sources: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      method: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      notes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      source: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      yearMap: { 'C': '1975/1987/1999/2011', 'E': '1977/1989/2001/2013', 'G': '1979/1991/2003/2015', 'H': '1980/1992/2004/2016', 'L': '1982/1994/2006/2018', 'M': '1983/1995/2007/2019', 'N': '1984/1996/2008/2020', 'R': '1985/1997/2009/2021', 'S': '1986/1998/2010/2022', 'T': '1987/1999/2011/2023', 'U': '1988/2000/2012/2024', 'V': '1989/2001/2013/2025' },
      monthMap: { 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'L': 'September', 'M': 'October', 'N': 'November', 'R': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 2) return null;
      var yearChar = serial[serial.length - 2].toUpperCase();
      var monthChar = serial[serial.length - 1].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar, yearCode: yearChar, monthCode: monthChar };
    }
    },
    'neptune': {
      name: 'Neptune',
      parentManufacturer: 'Whirlpool Corporation (legacy Maytag)',
      groupId: '1B',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: 'Pre-2006',
      serialLengthNote: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      decodeMethod: 'Second-to-last character of serial',
      yearCodePosition: 'Second-to-last character of serial',
      monthCodePosition: 'Last character of serial',
      outputType: 'Month + Year',
      decodeNotes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      exampleSerial: '(any serial ending in NC)',
      exampleResult: 'N=1984/2008/2020 + C=March',
      sources: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      method: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      notes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      source: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      yearMap: { 'C': '1975/1987/1999/2011', 'E': '1977/1989/2001/2013', 'G': '1979/1991/2003/2015', 'H': '1980/1992/2004/2016', 'L': '1982/1994/2006/2018', 'M': '1983/1995/2007/2019', 'N': '1984/1996/2008/2020', 'R': '1985/1997/2009/2021', 'S': '1986/1998/2010/2022', 'T': '1987/1999/2011/2023', 'U': '1988/2000/2012/2024', 'V': '1989/2001/2013/2025' },
      monthMap: { 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'L': 'September', 'M': 'October', 'N': 'November', 'R': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 2) return null;
      var yearChar = serial[serial.length - 2].toUpperCase();
      var monthChar = serial[serial.length - 1].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar, yearCode: yearChar, monthCode: monthChar };
    }
    },
    'imperial': {
      name: 'Imperial',
      parentManufacturer: 'Whirlpool Corporation (legacy Maytag)',
      groupId: '1B',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: 'Pre-2006',
      serialLengthNote: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      decodeMethod: 'Second-to-last character of serial',
      yearCodePosition: 'Second-to-last character of serial',
      monthCodePosition: 'Last character of serial',
      outputType: 'Month + Year',
      decodeNotes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      exampleSerial: '(any serial ending in NC)',
      exampleResult: 'N=1984/2008/2020 + C=March',
      sources: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      method: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      notes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      source: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      yearMap: { 'C': '1975/1987/1999/2011', 'E': '1977/1989/2001/2013', 'G': '1979/1991/2003/2015', 'H': '1980/1992/2004/2016', 'L': '1982/1994/2006/2018', 'M': '1983/1995/2007/2019', 'N': '1984/1996/2008/2020', 'R': '1985/1997/2009/2021', 'S': '1986/1998/2010/2022', 'T': '1987/1999/2011/2023', 'U': '1988/2000/2012/2024', 'V': '1989/2001/2013/2025' },
      monthMap: { 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'L': 'September', 'M': 'October', 'N': 'November', 'R': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 2) return null;
      var yearChar = serial[serial.length - 2].toUpperCase();
      var monthChar = serial[serial.length - 1].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar, yearCode: yearChar, monthCode: monthChar };
    }
    },
    'jenn_air_pre_2006': {
      name: 'Jenn-Air (pre-2006)',
      parentManufacturer: 'Whirlpool Corporation (legacy Maytag)',
      groupId: '1B',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: 'Pre-2006',
      serialLengthNote: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      decodeMethod: 'Second-to-last character of serial',
      yearCodePosition: 'Second-to-last character of serial',
      monthCodePosition: 'Last character of serial',
      outputType: 'Month + Year',
      decodeNotes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      exampleSerial: '(any serial ending in NC)',
      exampleResult: 'N=1984/2008/2020 + C=March',
      sources: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      method: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      notes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      source: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      yearMap: { 'C': '1975/1987/1999/2011', 'E': '1977/1989/2001/2013', 'G': '1979/1991/2003/2015', 'H': '1980/1992/2004/2016', 'L': '1982/1994/2006/2018', 'M': '1983/1995/2007/2019', 'N': '1984/1996/2008/2020', 'R': '1985/1997/2009/2021', 'S': '1986/1998/2010/2022', 'T': '1987/1999/2011/2023', 'U': '1988/2000/2012/2024', 'V': '1989/2001/2013/2025' },
      monthMap: { 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'L': 'September', 'M': 'October', 'N': 'November', 'R': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 2) return null;
      var yearChar = serial[serial.length - 2].toUpperCase();
      var monthChar = serial[serial.length - 1].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar, yearCode: yearChar, monthCode: monthChar };
    }
    },
    'amana_pre_2006': {
      name: 'Amana (pre-2006)',
      parentManufacturer: 'Whirlpool Corporation (legacy Maytag)',
      groupId: '1B',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: 'Pre-2006',
      serialLengthNote: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      decodeMethod: 'Second-to-last character of serial',
      yearCodePosition: 'Second-to-last character of serial',
      monthCodePosition: 'Last character of serial',
      outputType: 'Month + Year',
      decodeNotes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      exampleSerial: '(any serial ending in NC)',
      exampleResult: 'N=1984/2008/2020 + C=March',
      sources: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      method: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      notes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      source: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      yearMap: { 'C': '1975/1987/1999/2011', 'E': '1977/1989/2001/2013', 'G': '1979/1991/2003/2015', 'H': '1980/1992/2004/2016', 'L': '1982/1994/2006/2018', 'M': '1983/1995/2007/2019', 'N': '1984/1996/2008/2020', 'R': '1985/1997/2009/2021', 'S': '1986/1998/2010/2022', 'T': '1987/1999/2011/2023', 'U': '1988/2000/2012/2024', 'V': '1989/2001/2013/2025' },
      monthMap: { 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'L': 'September', 'M': 'October', 'N': 'November', 'R': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 2) return null;
      var yearChar = serial[serial.length - 2].toUpperCase();
      var monthChar = serial[serial.length - 1].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar, yearCode: yearChar, monthCode: monthChar };
    }
    },
    'admiral_pre_2006': {
      name: 'Admiral (pre-2006)',
      parentManufacturer: 'Whirlpool Corporation (legacy Maytag)',
      groupId: '1B',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: 'Pre-2006',
      serialLengthNote: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      decodeMethod: 'Second-to-last character of serial',
      yearCodePosition: 'Second-to-last character of serial',
      monthCodePosition: 'Last character of serial',
      outputType: 'Month + Year',
      decodeNotes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      exampleSerial: '(any serial ending in NC)',
      exampleResult: 'N=1984/2008/2020 + C=March',
      sources: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      method: 'Last 2 characters encode date. 2nd-to-last=year; last=month.',
      notes: 'Post-2006 Maytag uses Whirlpool Group 1A format. These codes apply only to pre-acquisition units.',
      source: 'lumayeconsulting.com; appliancefactoryparts.com; electrical-forensics.com',
      yearMap: { 'C': '1975/1987/1999/2011', 'E': '1977/1989/2001/2013', 'G': '1979/1991/2003/2015', 'H': '1980/1992/2004/2016', 'L': '1982/1994/2006/2018', 'M': '1983/1995/2007/2019', 'N': '1984/1996/2008/2020', 'R': '1985/1997/2009/2021', 'S': '1986/1998/2010/2022', 'T': '1987/1999/2011/2023', 'U': '1988/2000/2012/2024', 'V': '1989/2001/2013/2025' },
      monthMap: { 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'L': 'September', 'M': 'October', 'N': 'November', 'R': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 2) return null;
      var yearChar = serial[serial.length - 2].toUpperCase();
      var monthChar = serial[serial.length - 1].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar, yearCode: yearChar, monthCode: monthChar };
    }
    },
    'ge': {
      name: 'GE',
      parentManufacturer: 'GE Appliances (owned by Haier since 2016)',
      groupId: '2',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1977-Present',
      serialLengthNote: 'Serial begins with 2 letters followed by 6 digits and optional suffix.',
      decodeMethod: 'Characters 1-2 (Character 1 = month, Character 2 = year)',
      yearCodePosition: 'Character 2 (second letter)',
      monthCodePosition: 'Character 1 (first letter)',
      outputType: 'Month + Year',
      decodeNotes: '12-year repeating cycle. This same GE-family decoding logic also applies to Cafe, GE Profile, GE Monogram, Hotpoint, and RCA appliance brands. GE water heaters manufactured by Rheem â€” use Group 7A. Haier-era units (post-2016) continue using same format.',
      exampleSerial: 'RG527327B',
      exampleResult: 'R=August G=1980/1992/2004/2016',
      sources: 'products.geappliances.com; cannonsappliance.com; lumayeconsulting.com; en.tab-tv.com',
      method: 'Characters 1-2 (Character 1 = month, Character 2 = year)',
      notes: '12-year repeating cycle. This same GE-family decoding logic also applies to Cafe, GE Profile, GE Monogram, Hotpoint, and RCA appliance brands. GE water heaters manufactured by Rheem â€” use Group 7A. Haier-era units (post-2016) continue using same format.',
      source: 'products.geappliances.com; cannonsappliance.com; lumayeconsulting.com; en.tab-tv.com',
      patterns: [
        { name: '8-char standard', length: 8, mask: 'AA######', notes: 'Starts with two letters, followed by six digits.' },
        { name: '9-char with suffix', length: 9, mask: 'AA######*', notes: 'Starts with two letters, followed by six digits and optional suffix.' },
        { name: '10-char with suffix', length: 10, mask: 'AA######**', notes: 'Starts with two letters, followed by six digits and optional suffix.' }
      ],
      yearMap: { 'A': '1977/1989/2001/2013/2025', 'D': '1978/1990/2002/2014/2026', 'F': '1979/1991/2003/2015', 'G': '1980/1992/2004/2016', 'H': '1981/1993/2005/2017', 'L': '1982/1994/2006/2018', 'M': '1983/1995/2007/2019', 'R': '1984/1996/2008/2020', 'S': '1985/1997/2009/2021', 'T': '1986/1998/2010/2022', 'V': '1987/1999/2011/2023', 'Z': '1988/2000/2012/2024' },
      monthMap: { 'A': 'January', 'D': 'February', 'F': 'March', 'G': 'April', 'H': 'May', 'L': 'June', 'M': 'July', 'R': 'August', 'S': 'September', 'T': 'October', 'V': 'November', 'Z': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 2) return null;
      var monthChar = serial[0].toUpperCase();
      var yearChar = serial[1].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar, yearCode: yearChar, monthCode: monthChar };
    }
    },
    'cafe': {
      name: 'Cafe',
      parentManufacturer: 'GE Appliances (owned by Haier since 2016)',
      groupId: '2',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1977-Present',
      serialLengthNote: 'Serial begins with 2 letters followed by 6 digits and optional suffix.',
      decodeMethod: 'Characters 1-2 (Character 1 = month, Character 2 = year)',
      yearCodePosition: 'Character 2 (second letter)',
      monthCodePosition: 'Character 1 (first letter)',
      outputType: 'Month + Year',
      decodeNotes: '12-year repeating cycle. GE water heaters manufactured by Rheem â€” use Group 7A. Haier-era units (post-2016) continue using same format.',
      exampleSerial: 'RG527327B',
      exampleResult: 'R=August G=1980/1992/2004/2016',
      sources: 'products.geappliances.com; cannonsappliance.com; lumayeconsulting.com; en.tab-tv.com',
      method: 'Characters 1-2 (Character 1 = month, Character 2 = year)',
      notes: '12-year repeating cycle. GE water heaters manufactured by Rheem â€” use Group 7A. Haier-era units (post-2016) continue using same format.',
      source: 'products.geappliances.com; cannonsappliance.com; lumayeconsulting.com; en.tab-tv.com',
      yearMap: { 'A': '1977/1989/2001/2013/2025', 'D': '1978/1990/2002/2014/2026', 'F': '1979/1991/2003/2015', 'G': '1980/1992/2004/2016', 'H': '1981/1993/2005/2017', 'L': '1982/1994/2006/2018', 'M': '1983/1995/2007/2019', 'R': '1984/1996/2008/2020', 'S': '1985/1997/2009/2021', 'T': '1986/1998/2010/2022', 'V': '1987/1999/2011/2023', 'Z': '1988/2000/2012/2024' },
      monthMap: { 'A': 'January', 'D': 'February', 'F': 'March', 'G': 'April', 'H': 'May', 'L': 'June', 'M': 'July', 'R': 'August', 'S': 'September', 'T': 'October', 'V': 'November', 'Z': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 2) return null;
      var monthChar = serial[0].toUpperCase();
      var yearChar = serial[1].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar, yearCode: yearChar, monthCode: monthChar };
    }
    },




    'frigidaire': {
      name: 'Frigidaire',
      parentManufacturer: 'Electrolux AB (Sweden)',
      groupId: '3',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: '1988-Present',
      serialLengthNote: 'Serial: [2-letter factory code][year digit][2-digit week][remaining digits]',
      decodeMethod: 'After factory letters: year digit + week digits (use week-of-year to pinpoint date range)',
      yearCodePosition: 'Character 3 (first digit after 2-letter factory code)',
      monthCodePosition: 'Characters 4-5',
      outputType: 'Year + Week (approximate month)',
      decodeNotes: 'Year digit can be decade-ambiguous ï¿½ model/style context often needed. Week-of-year helps pinpoint a date range.',
      exampleSerial: 'NF11910958',
      exampleResult: '1=2001/2011 Week 19=~April -> April 2001',
      sources: 'electrical-forensics.com; cannonsappliance.com; lumayeconsulting.com; appliancefactoryparts.com',
      method: 'After factory letters: year digit + week digits (use week-of-year to pinpoint date range)',
      notes: 'Year digit can be decade-ambiguous ï¿½ model/style context often needed. Week-of-year helps pinpoint a date range.',
      source: 'electrical-forensics.com; cannonsappliance.com; lumayeconsulting.com; appliancefactoryparts.com',
      yearMap: { '0': '1990/2000/2010/2020', '1': '1991/2001/2011/2021', '2': '1992/2002/2012/2022', '3': '1993/2003/2013/2023', '4': '1994/2004/2014/2024', '5': '1995/2005/2015/2025', '6': '1996/2006/2016', '7': '1997/2007/2017', '8': '1988/1998/2008/2018', '9': '1989/1999/2009/2019' },
      monthMap: { 'Week 01-04': '~January', 'Week 05-08': '~February', 'Week 09-13': '~March', 'Week 14-17': '~April', 'Week 18-21': '~May', 'Week 22-26': '~June', 'Week 27-30': '~July', 'Week 31-34': '~August', 'Week 35-39': '~September', 'Week 40-43': '~October', 'Week 44-47': '~November', 'Week 48-52': '~December' },
      decode: function(serial) {
      if (!serial || serial.length < 5) return null;
      var yearDigit = serial[2];
      var week = serial.substring(3, 5);
      var y = this.yearMap[yearDigit];
      return { year: y || 'Unknown code: ' + yearDigit, month: 'Week ' + week + ' (see notes for decade)', yearCode: yearDigit, weekDigits: week };
    }
    },
    'electrolux': {
      name: 'Electrolux',
      parentManufacturer: 'Electrolux AB (Sweden)',
      groupId: '3',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: '1988-Present',
      serialLengthNote: 'Serial: [2-letter factory code][year digit][2-digit week][remaining digits]',
      decodeMethod: 'Character 3 (first digit after 2-letter factory code)',
      yearCodePosition: 'Character 3 (first digit after 2-letter factory code)',
      monthCodePosition: 'Characters 4-5',
      outputType: 'Year + Week (approximate month)',
      decodeNotes: 'Decade must be inferred from physical condition or model history. 10-year repeating cycle on year digit.',
      exampleSerial: 'NF11910958',
      exampleResult: '1=2001/2011 Week 19=~April -> April 2001',
      sources: 'electrical-forensics.com; cannonsappliance.com; lumayeconsulting.com; appliancefactoryparts.com',
      method: 'Serial: [2-letter factory code][year digit][2-digit week][remaining digits]',
      notes: 'Decade must be inferred from physical condition or model history. 10-year repeating cycle on year digit.',
      source: 'electrical-forensics.com; cannonsappliance.com; lumayeconsulting.com; appliancefactoryparts.com',
      yearMap: { '0': '1990/2000/2010/2020', '1': '1991/2001/2011/2021', '2': '1992/2002/2012/2022', '3': '1993/2003/2013/2023', '4': '1994/2004/2014/2024', '5': '1995/2005/2015/2025', '6': '1996/2006/2016', '7': '1997/2007/2017', '8': '1988/1998/2008/2018', '9': '1989/1999/2009/2019' },
      monthMap: { 'Week 01-04': '~January', 'Week 05-08': '~February', 'Week 09-13': '~March', 'Week 14-17': '~April', 'Week 18-21': '~May', 'Week 22-26': '~June', 'Week 27-30': '~July', 'Week 31-34': '~August', 'Week 35-39': '~September', 'Week 40-43': '~October', 'Week 44-47': '~November', 'Week 48-52': '~December' },
      decode: function(serial) {
      if (!serial || serial.length < 5) return null;
      var yearDigit = serial[2];
      var week = serial.substring(3, 5);
      var y = this.yearMap[yearDigit];
      return { year: y || 'Unknown code: ' + yearDigit, month: 'Week ' + week + ' (see notes for decade)', yearCode: yearDigit, weekDigits: week };
    }
    },
    'philco': {
      name: 'Philco',
      parentManufacturer: 'Electrolux AB (Sweden)',
      groupId: '3',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: '1988-Present',
      serialLengthNote: 'Serial: [2-letter factory code][year digit][2-digit week][remaining digits]',
      decodeMethod: 'Character 3 (first digit after 2-letter factory code)',
      yearCodePosition: 'Character 3 (first digit after 2-letter factory code)',
      monthCodePosition: 'Characters 4-5',
      outputType: 'Year + Week (approximate month)',
      decodeNotes: 'Decade must be inferred from physical condition or model history. 10-year repeating cycle on year digit.',
      exampleSerial: 'NF11910958',
      exampleResult: '1=2001/2011 Week 19=~April -> April 2001',
      sources: 'electrical-forensics.com; cannonsappliance.com; lumayeconsulting.com; appliancefactoryparts.com',
      method: 'Serial: [2-letter factory code][year digit][2-digit week][remaining digits]',
      notes: 'Decade must be inferred from physical condition or model history. 10-year repeating cycle on year digit.',
      source: 'electrical-forensics.com; cannonsappliance.com; lumayeconsulting.com; appliancefactoryparts.com',
      yearMap: { '0': '1990/2000/2010/2020', '1': '1991/2001/2011/2021', '2': '1992/2002/2012/2022', '3': '1993/2003/2013/2023', '4': '1994/2004/2014/2024', '5': '1995/2005/2015/2025', '6': '1996/2006/2016', '7': '1997/2007/2017', '8': '1988/1998/2008/2018', '9': '1989/1999/2009/2019' },
      monthMap: { 'Week 01-04': '~January', 'Week 05-08': '~February', 'Week 09-13': '~March', 'Week 14-17': '~April', 'Week 18-21': '~May', 'Week 22-26': '~June', 'Week 27-30': '~July', 'Week 31-34': '~August', 'Week 35-39': '~September', 'Week 40-43': '~October', 'Week 44-47': '~November', 'Week 48-52': '~December' },
      decode: function(serial) {
      if (!serial || serial.length < 5) return null;
      var yearDigit = serial[2];
      var week = serial.substring(3, 5);
      var y = this.yearMap[yearDigit];
      return { year: y || 'Unknown code: ' + yearDigit, month: 'Week ' + week + ' (see notes for decade)', yearCode: yearDigit, weekDigits: week };
    }
    },
    'tappan': {
      name: 'Tappan',
      parentManufacturer: 'Electrolux AB (Sweden)',
      groupId: '3',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: '1988-Present',
      serialLengthNote: 'Serial: [2-letter factory code][year digit][2-digit week][remaining digits]',
      decodeMethod: 'Character 3 (first digit after 2-letter factory code)',
      yearCodePosition: 'Character 3 (first digit after 2-letter factory code)',
      monthCodePosition: 'Characters 4-5',
      outputType: 'Year + Week (approximate month)',
      decodeNotes: 'Decade must be inferred from physical condition or model history. 10-year repeating cycle on year digit.',
      exampleSerial: 'NF11910958',
      exampleResult: '1=2001/2011 Week 19=~April -> April 2001',
      sources: 'electrical-forensics.com; cannonsappliance.com; lumayeconsulting.com; appliancefactoryparts.com',
      method: 'Serial: [2-letter factory code][year digit][2-digit week][remaining digits]',
      notes: 'Decade must be inferred from physical condition or model history. 10-year repeating cycle on year digit.',
      source: 'electrical-forensics.com; cannonsappliance.com; lumayeconsulting.com; appliancefactoryparts.com',
      yearMap: { '0': '1990/2000/2010/2020', '1': '1991/2001/2011/2021', '2': '1992/2002/2012/2022', '3': '1993/2003/2013/2023', '4': '1994/2004/2014/2024', '5': '1995/2005/2015/2025', '6': '1996/2006/2016', '7': '1997/2007/2017', '8': '1988/1998/2008/2018', '9': '1989/1999/2009/2019' },
      monthMap: { 'Week 01-04': '~January', 'Week 05-08': '~February', 'Week 09-13': '~March', 'Week 14-17': '~April', 'Week 18-21': '~May', 'Week 22-26': '~June', 'Week 27-30': '~July', 'Week 31-34': '~August', 'Week 35-39': '~September', 'Week 40-43': '~October', 'Week 44-47': '~November', 'Week 48-52': '~December' },
      decode: function(serial) {
      if (!serial || serial.length < 5) return null;
      var yearDigit = serial[2];
      var week = serial.substring(3, 5);
      var y = this.yearMap[yearDigit];
      return { year: y || 'Unknown code: ' + yearDigit, month: 'Week ' + week + ' (see notes for decade)', yearCode: yearDigit, weekDigits: week };
    }
    },
    'kelvinator': {
      name: 'Kelvinator',
      parentManufacturer: 'Electrolux AB (Sweden)',
      groupId: '3',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: '1988-Present',
      serialLengthNote: 'Serial: [2-letter factory code][year digit][2-digit week][remaining digits]',
      decodeMethod: 'Character 3 (first digit after 2-letter factory code)',
      yearCodePosition: 'Character 3 (first digit after 2-letter factory code)',
      monthCodePosition: 'Characters 4-5',
      outputType: 'Year + Week (approximate month)',
      decodeNotes: 'Decade must be inferred from physical condition or model history. 10-year repeating cycle on year digit.',
      exampleSerial: 'NF11910958',
      exampleResult: '1=2001/2011 Week 19=~April -> April 2001',
      sources: 'electrical-forensics.com; cannonsappliance.com; lumayeconsulting.com; appliancefactoryparts.com',
      method: 'Serial: [2-letter factory code][year digit][2-digit week][remaining digits]',
      notes: 'Decade must be inferred from physical condition or model history. 10-year repeating cycle on year digit.',
      source: 'electrical-forensics.com; cannonsappliance.com; lumayeconsulting.com; appliancefactoryparts.com',
      yearMap: { '0': '1990/2000/2010/2020', '1': '1991/2001/2011/2021', '2': '1992/2002/2012/2022', '3': '1993/2003/2013/2023', '4': '1994/2004/2014/2024', '5': '1995/2005/2015/2025', '6': '1996/2006/2016', '7': '1997/2007/2017', '8': '1988/1998/2008/2018', '9': '1989/1999/2009/2019' },
      monthMap: { 'Week 01-04': '~January', 'Week 05-08': '~February', 'Week 09-13': '~March', 'Week 14-17': '~April', 'Week 18-21': '~May', 'Week 22-26': '~June', 'Week 27-30': '~July', 'Week 31-34': '~August', 'Week 35-39': '~September', 'Week 40-43': '~October', 'Week 44-47': '~November', 'Week 48-52': '~December' },
      decode: function(serial) {
      if (!serial || serial.length < 5) return null;
      var yearDigit = serial[2];
      var week = serial.substring(3, 5);
      var y = this.yearMap[yearDigit];
      return { year: y || 'Unknown code: ' + yearDigit, month: 'Week ' + week + ' (see notes for decade)', yearCode: yearDigit, weekDigits: week };
    }
    },
    'gibson': {
      name: 'Gibson',
      parentManufacturer: 'Electrolux AB (Sweden)',
      groupId: '3',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: '1988-Present',
      serialLengthNote: 'Serial: [2-letter factory code][year digit][2-digit week][remaining digits]',
      decodeMethod: 'Character 3 (first digit after 2-letter factory code)',
      yearCodePosition: 'Character 3 (first digit after 2-letter factory code)',
      monthCodePosition: 'Characters 4-5',
      outputType: 'Year + Week (approximate month)',
      decodeNotes: 'Decade must be inferred from physical condition or model history. 10-year repeating cycle on year digit.',
      exampleSerial: 'NF11910958',
      exampleResult: '1=2001/2011 Week 19=~April -> April 2001',
      sources: 'electrical-forensics.com; cannonsappliance.com; lumayeconsulting.com; appliancefactoryparts.com',
      method: 'Serial: [2-letter factory code][year digit][2-digit week][remaining digits]',
      notes: 'Decade must be inferred from physical condition or model history. 10-year repeating cycle on year digit.',
      source: 'electrical-forensics.com; cannonsappliance.com; lumayeconsulting.com; appliancefactoryparts.com',
      yearMap: { '0': '1990/2000/2010/2020', '1': '1991/2001/2011/2021', '2': '1992/2002/2012/2022', '3': '1993/2003/2013/2023', '4': '1994/2004/2014/2024', '5': '1995/2005/2015/2025', '6': '1996/2006/2016', '7': '1997/2007/2017', '8': '1988/1998/2008/2018', '9': '1989/1999/2009/2019' },
      monthMap: { 'Week 01-04': '~January', 'Week 05-08': '~February', 'Week 09-13': '~March', 'Week 14-17': '~April', 'Week 18-21': '~May', 'Week 22-26': '~June', 'Week 27-30': '~July', 'Week 31-34': '~August', 'Week 35-39': '~September', 'Week 40-43': '~October', 'Week 44-47': '~November', 'Week 48-52': '~December' },
      decode: function(serial) {
      if (!serial || serial.length < 5) return null;
      var yearDigit = serial[2];
      var week = serial.substring(3, 5);
      var y = this.yearMap[yearDigit];
      return { year: y || 'Unknown code: ' + yearDigit, month: 'Week ' + week + ' (see notes for decade)', yearCode: yearDigit, weekDigits: week };
    }
    },
    'white_westinghouse': {
      name: 'White-Westinghouse',
      parentManufacturer: 'Electrolux AB (Sweden)',
      groupId: '3',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: '1988-Present',
      serialLengthNote: 'Serial: [2-letter factory code][year digit][2-digit week][remaining digits]',
      decodeMethod: 'Character 3 (first digit after 2-letter factory code)',
      yearCodePosition: 'Character 3 (first digit after 2-letter factory code)',
      monthCodePosition: 'Characters 4-5',
      outputType: 'Year + Week (approximate month)',
      decodeNotes: 'Decade must be inferred from physical condition or model history. 10-year repeating cycle on year digit.',
      exampleSerial: 'NF11910958',
      exampleResult: '1=2001/2011 Week 19=~April -> April 2001',
      sources: 'electrical-forensics.com; cannonsappliance.com; lumayeconsulting.com; appliancefactoryparts.com',
      method: 'Serial: [2-letter factory code][year digit][2-digit week][remaining digits]',
      notes: 'Decade must be inferred from physical condition or model history. 10-year repeating cycle on year digit.',
      source: 'electrical-forensics.com; cannonsappliance.com; lumayeconsulting.com; appliancefactoryparts.com',
      yearMap: { '0': '1990/2000/2010/2020', '1': '1991/2001/2011/2021', '2': '1992/2002/2012/2022', '3': '1993/2003/2013/2023', '4': '1994/2004/2014/2024', '5': '1995/2005/2015/2025', '6': '1996/2006/2016', '7': '1997/2007/2017', '8': '1988/1998/2008/2018', '9': '1989/1999/2009/2019' },
      monthMap: { 'Week 01-04': '~January', 'Week 05-08': '~February', 'Week 09-13': '~March', 'Week 14-17': '~April', 'Week 18-21': '~May', 'Week 22-26': '~June', 'Week 27-30': '~July', 'Week 31-34': '~August', 'Week 35-39': '~September', 'Week 40-43': '~October', 'Week 44-47': '~November', 'Week 48-52': '~December' },
      decode: function(serial) {
      if (!serial || serial.length < 5) return null;
      var yearDigit = serial[2];
      var week = serial.substring(3, 5);
      var y = this.yearMap[yearDigit];
      return { year: y || 'Unknown code: ' + yearDigit, month: 'Week ' + week + ' (see notes for decade)', yearCode: yearDigit, weekDigits: week };
    }
    },
    'white_consolidated_industries_wci': {
      name: 'White Consolidated Industries (WCI)',
      parentManufacturer: 'Electrolux AB (Sweden)',
      groupId: '3',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: '1988-Present',
      serialLengthNote: 'Serial: [2-letter factory code][year digit][2-digit week][remaining digits]',
      decodeMethod: 'Character 3 (first digit after 2-letter factory code)',
      yearCodePosition: 'Character 3 (first digit after 2-letter factory code)',
      monthCodePosition: 'Characters 4-5',
      outputType: 'Year + Week (approximate month)',
      decodeNotes: 'Decade must be inferred from physical condition or model history. 10-year repeating cycle on year digit.',
      exampleSerial: 'NF11910958',
      exampleResult: '1=2001/2011 Week 19=~April -> April 2001',
      sources: 'electrical-forensics.com; cannonsappliance.com; lumayeconsulting.com; appliancefactoryparts.com',
      method: 'Serial: [2-letter factory code][year digit][2-digit week][remaining digits]',
      notes: 'Decade must be inferred from physical condition or model history. 10-year repeating cycle on year digit.',
      source: 'electrical-forensics.com; cannonsappliance.com; lumayeconsulting.com; appliancefactoryparts.com',
      yearMap: { '0': '1990/2000/2010/2020', '1': '1991/2001/2011/2021', '2': '1992/2002/2012/2022', '3': '1993/2003/2013/2023', '4': '1994/2004/2014/2024', '5': '1995/2005/2015/2025', '6': '1996/2006/2016', '7': '1997/2007/2017', '8': '1988/1998/2008/2018', '9': '1989/1999/2009/2019' },
      monthMap: { 'Week 01-04': '~January', 'Week 05-08': '~February', 'Week 09-13': '~March', 'Week 14-17': '~April', 'Week 18-21': '~May', 'Week 22-26': '~June', 'Week 27-30': '~July', 'Week 31-34': '~August', 'Week 35-39': '~September', 'Week 40-43': '~October', 'Week 44-47': '~November', 'Week 48-52': '~December' },
      decode: function(serial) {
      if (!serial || serial.length < 5) return null;
      var yearDigit = serial[2];
      var week = serial.substring(3, 5);
      var y = this.yearMap[yearDigit];
      return { year: y || 'Unknown code: ' + yearDigit, month: 'Week ' + week + ' (see notes for decade)', yearCode: yearDigit, weekDigits: week };
    }
    },
    'samsung': {
      name: 'Samsung',
      parentManufacturer: 'Samsung Electronics',
      groupId: '4A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: '2001-Present',
      serialLengthNote: '15-digit: year+month at chars 8-9. 11-digit: year+month at chars 4-5.',
      decodeMethod: '15-digit: Characters 8-9 (year + month). 11-digit: Characters 4-5 (year + month).',
      yearCodePosition: 'Char 8 (15-digit) or Char 4 (11-digit)',
      monthCodePosition: 'Char 9 (15-digit) or Char 5 (11-digit)',
      outputType: 'Month + Year',
      decodeNotes: 'Identify serial length before decoding. 20-year repeating cycle for some codes (R T W X Y A).',
      exampleSerial: '07R5CAZHB001234 (15-char)',
      exampleResult: 'Char 8=A=2006/2026 Char 9=Z -> invalid; use actual serial',
      sources: 'homespy.io; electrical-forensics.com; lumayeconsulting.com',
      method: '15-digit: Characters 8-9 (year + month). 11-digit: Characters 4-5 (year + month).',
      notes: 'Identify serial length before decoding. 20-year repeating cycle for some codes (R T W X Y A).',
      source: 'homespy.io; electrical-forensics.com; lumayeconsulting.com',
      patterns: [
        { name: '11-char serial', length: 11, mask: '***A*******', notes: 'Year code is at position 4.' },
        { name: '15-char serial', length: 15, mask: '*******A*******', notes: 'Year code is at position 8.' }
      ],
      yearMap: { 'R': '2001/2021', 'T': '2002/2022', 'W': '2003/2023', 'X': '2004/2024', 'Y': '2005/2025', 'A': '2006/2026', 'P': '2007/2027', 'Q': '2008/2028', 'S': '2009/2029', 'Z': '2010/2030', 'B': '2011/2031', 'C': '2012/2032', 'D': '2013/2033', 'F': '2014/2034', 'G': '2015/2035', 'H': '2016/2036', 'J': '2017/2037', 'K': '2018/2038', 'M': '2019/2039', 'N': '2020/2040' },
      monthMap: { '1': 'January', '2': 'February', '3': 'March', '4': 'April', '5': 'May', '6': 'June', '7': 'July', '8': 'August', '9': 'September', 'A': 'October', 'B': 'November', 'C': 'December' },
            decode: function(serial) {
      if (!serial) return null;
      var len = serial.length;
      var yearChar = '';
      var monthChar = '';
      if (len >= 14) {
        yearChar = serial[7];
        monthChar = serial[8];
      } else if (len >= 11) {
        yearChar = serial[3];
        monthChar = serial[4];
      } else {
        return null;
      }
      yearChar = yearChar ? yearChar.toUpperCase() : '';
      monthChar = monthChar ? monthChar.toUpperCase() : '';
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar, yearCode: yearChar, monthCode: monthChar };
    }
    },
    'lg': {
      name: 'LG',
      parentManufacturer: 'LG Electronics',
      groupId: '4B',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: '2000-Present',
      serialLengthNote: 'Serial: [Year digit][2-digit month][remaining alphanumeric]',
      decodeMethod: 'Character 1 (year last digit) + Characters 2-3 (month, two-digit number format)',
      yearCodePosition: 'Character 1',
      monthCodePosition: 'Characters 2-3',
      outputType: 'Month + Year',
      decodeNotes: 'Decade must be inferred. 10-year repeating cycle. Example: 810XXXX = October 2008 or 2018. Model number is needed to narrow decade/exact year.',
      exampleSerial: '810tagh22222',
      exampleResult: '8=2008/2018 10=October -> October 2008 or 2018',
      sources: 'homespy.io; lumayeconsulting.com; cannonsappliance.com',
      method: 'Character 1 (year last digit) + Characters 2-3 (month, two-digit number format)',
      notes: 'Decade must be inferred. 10-year repeating cycle. Example: 810XXXX = October 2008 or 2018. Model number is needed to narrow decade/exact year.',
      source: 'homespy.io; lumayeconsulting.com; cannonsappliance.com',
      patterns: [
        { name: '8-char serial', length: 8, mask: '###*****', notes: 'Character 1 is year digit, characters 2-3 are month digits.' },
        { name: '9-char serial', length: 9, mask: '###******', notes: 'Character 1 is year digit, characters 2-3 are month digits.' },
        { name: '10-char serial', length: 10, mask: '###*******', notes: 'Character 1 is year digit, characters 2-3 are month digits.' },
        { name: '11-char serial', length: 11, mask: '###********', notes: 'Character 1 is year digit, characters 2-3 are month digits.' },
        { name: '12-char serial', length: 12, mask: '###*********', notes: 'Character 1 is year digit, characters 2-3 are month digits.' }
      ],
      yearMap: { '0': '2000/2010/2020', '1': '2001/2011/2021', '2': '2002/2012/2022', '3': '2003/2013/2023', '4': '2004/2014/2024', '5': '2005/2015/2025', '6': '2006/2016', '7': '2007/2017', '8': '2008/2018', '9': '2009/2019' },
      monthMap: { '10': 'October', '11': 'November', '12': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 3) return null;
      var yearDigit = serial[0];
      var monthCode = serial.substring(1, 3).toUpperCase();
      var y = this.yearMap[yearDigit];
      var m = this.monthMap[monthCode];
      return { year: y || 'Unknown code: ' + yearDigit, month: m || 'Unknown code: ' + monthCode, yearCode: yearDigit, monthCode: monthCode };
    }
    },
    'bosch': {
      name: 'Bosch',
      parentManufacturer: 'BSH Home Appliances (Bosch-Siemens)',
      groupId: '5',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: '1999-Present',
      serialLengthNote: 'Serial always begins with \'FD\' followed by numeric production code.',
      decodeMethod: 'FD digits 1-2 (first two numbers after \'FD\')',
      yearCodePosition: 'FD digits 1-2 (first two numbers after \'FD\')',
      monthCodePosition: 'FD digits 3-4',
      outputType: 'Month + Year',
      decodeNotes: 'Formula: FD digits 1-2 + 20 = year. If sum >= 100 drop the first digit. FD = Fertigungsdatum (German: production date). All three brands use identical logic.',
      exampleSerial: 'FD911100449',
      exampleResult: '91+20=111 -> drop 1 -> 2011; month 11 = November',
      sources: 'electrical-forensics.com; homespy.io; lumayeconsulting.com; building-center.org',
      method: 'Serial always begins with \'FD\' followed by numeric production code.',
      notes: 'Formula: FD digits 1-2 + 20 = year. If sum >= 100 drop the first digit. FD = Fertigungsdatum (German: production date). All three brands use identical logic.',
      source: 'electrical-forensics.com; homespy.io; lumayeconsulting.com; building-center.org',
      patterns: [
        { name: '9-char FD serial', length: 9, mask: 'AA####***', prefix: 'FD', notes: 'Must start with FD, followed by 4 numeric date digits.' },
        { name: '10-char FD serial', length: 10, mask: 'AA####****', prefix: 'FD', notes: 'Must start with FD, followed by 4 numeric date digits.' },
        { name: '11-char FD serial', length: 11, mask: 'AA####*****', prefix: 'FD', notes: 'Must start with FD, followed by 4 numeric date digits.' },
        { name: '12-char FD serial', length: 12, mask: 'AA####******', prefix: 'FD', notes: 'Must start with FD, followed by 4 numeric date digits.' }
      ],
      yearMap: { 'FD79': '1999', 'FD80': '2000', 'FD81': '2001', 'FD82': '2002', 'FD83': '2003', 'FD84': '2004', 'FD85': '2005', 'FD86': '2006', 'FD87': '2007', 'FD88': '2008', 'FD89': '2009', 'FD90': '2010', 'FD91': '2011', 'FD92': '2012', 'FD93': '2013', 'FD94': '2014', 'FD95': '2015', 'FD96': '2016', 'FD97': '2017', 'FD98': '2018', 'FD99': '2019', 'FD00': '2020', 'FD01': '2021', 'FD02': '2022', 'FD03': '2023', 'FD04': '2024', 'FD05': '2025' },
      monthMap: { '10': 'October', '11': 'November', '12': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial) return null;
      var s = serial.toUpperCase().replace(/^FD/, '');
      if (s.length < 4) return null;
      var fdYear = s.substring(0, 2);
      var fdMonth = s.substring(2, 4);
      var y = this.yearMap['FD' + fdYear];
      var m = this.monthMap[fdMonth];
      if (!y) { var num = parseInt(fdYear); y = (num < 50) ? '20' + fdYear : '19' + fdYear; }
      return { year: y || fdYear, month: m || 'Unknown code: ' + fdMonth, yearCode: fdYear, monthCode: fdMonth };
    }
    },
    'thermador': {
      name: 'Thermador',
      parentManufacturer: 'BSH Home Appliances (Bosch-Siemens)',
      groupId: '5',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: '1999-Present',
      serialLengthNote: 'Serial always begins with \'FD\' followed by numeric production code.',
      decodeMethod: 'FD digits 1-2 (first two numbers after \'FD\')',
      yearCodePosition: 'FD digits 1-2 (first two numbers after \'FD\')',
      monthCodePosition: 'FD digits 3-4',
      outputType: 'Month + Year',
      decodeNotes: 'Formula: FD digits 1-2 + 20 = year. If sum >= 100 drop the first digit. FD = Fertigungsdatum (German: production date). All three brands use identical logic.',
      exampleSerial: 'FD911100449',
      exampleResult: '91+20=111 -> drop 1 -> 2011; month 11 = November',
      sources: 'electrical-forensics.com; homespy.io; lumayeconsulting.com; building-center.org',
      method: 'Serial always begins with \'FD\' followed by numeric production code.',
      notes: 'Formula: FD digits 1-2 + 20 = year. If sum >= 100 drop the first digit. FD = Fertigungsdatum (German: production date). All three brands use identical logic.',
      source: 'electrical-forensics.com; homespy.io; lumayeconsulting.com; building-center.org',
      yearMap: { 'FD79': '1999', 'FD80': '2000', 'FD81': '2001', 'FD82': '2002', 'FD83': '2003', 'FD84': '2004', 'FD85': '2005', 'FD86': '2006', 'FD87': '2007', 'FD88': '2008', 'FD89': '2009', 'FD90': '2010', 'FD91': '2011', 'FD92': '2012', 'FD93': '2013', 'FD94': '2014', 'FD95': '2015', 'FD96': '2016', 'FD97': '2017', 'FD98': '2018', 'FD99': '2019', 'FD00': '2020', 'FD01': '2021', 'FD02': '2022', 'FD03': '2023', 'FD04': '2024', 'FD05': '2025' },
      monthMap: { '10': 'October', '11': 'November', '12': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial) return null;
      var s = serial.toUpperCase().replace(/^FD/, '');
      if (s.length < 4) return null;
      var fdYear = s.substring(0, 2);
      var fdMonth = s.substring(2, 4);
      var y = this.yearMap['FD' + fdYear];
      var m = this.monthMap[fdMonth];
      if (!y) { var num = parseInt(fdYear); y = (num < 50) ? '20' + fdYear : '19' + fdYear; }
      return { year: y || fdYear, month: m || 'Unknown code: ' + fdMonth, yearCode: fdYear, monthCode: fdMonth };
    }
    },
    'gaggenau': {
      name: 'Gaggenau',
      parentManufacturer: 'BSH Home Appliances (Bosch-Siemens)',
      groupId: '5',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: '1999-Present',
      serialLengthNote: 'Serial always begins with \'FD\' followed by numeric production code.',
      decodeMethod: 'FD digits 1-2 (first two numbers after \'FD\')',
      yearCodePosition: 'FD digits 1-2 (first two numbers after \'FD\')',
      monthCodePosition: 'FD digits 3-4',
      outputType: 'Month + Year',
      decodeNotes: 'Formula: FD digits 1-2 + 20 = year. If sum >= 100 drop the first digit. FD = Fertigungsdatum (German: production date). All three brands use identical logic.',
      exampleSerial: 'FD911100449',
      exampleResult: '91+20=111 -> drop 1 -> 2011; month 11 = November',
      sources: 'electrical-forensics.com; homespy.io; lumayeconsulting.com; building-center.org',
      method: 'Serial always begins with \'FD\' followed by numeric production code.',
      notes: 'Formula: FD digits 1-2 + 20 = year. If sum >= 100 drop the first digit. FD = Fertigungsdatum (German: production date). All three brands use identical logic.',
      source: 'electrical-forensics.com; homespy.io; lumayeconsulting.com; building-center.org',
      yearMap: { 'FD79': '1999', 'FD80': '2000', 'FD81': '2001', 'FD82': '2002', 'FD83': '2003', 'FD84': '2004', 'FD85': '2005', 'FD86': '2006', 'FD87': '2007', 'FD88': '2008', 'FD89': '2009', 'FD90': '2010', 'FD91': '2011', 'FD92': '2012', 'FD93': '2013', 'FD94': '2014', 'FD95': '2015', 'FD96': '2016', 'FD97': '2017', 'FD98': '2018', 'FD99': '2019', 'FD00': '2020', 'FD01': '2021', 'FD02': '2022', 'FD03': '2023', 'FD04': '2024', 'FD05': '2025' },
      monthMap: { '10': 'October', '11': 'November', '12': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial) return null;
      var s = serial.toUpperCase().replace(/^FD/, '');
      if (s.length < 4) return null;
      var fdYear = s.substring(0, 2);
      var fdMonth = s.substring(2, 4);
      var y = this.yearMap['FD' + fdYear];
      var m = this.monthMap[fdMonth];
      if (!y) { var num = parseInt(fdYear); y = (num < 50) ? '20' + fdYear : '19' + fdYear; }
      return { year: y || fdYear, month: m || 'Unknown code: ' + fdMonth, yearCode: fdYear, monthCode: fdMonth };
    }
    },
    'kenmore': {
      name: 'Kenmore',
      parentManufacturer: 'Sears (OEM varies by model prefix)',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: 'Enter the first 3 digits of the model number to identify the OEM manufacturer.',
      decodeMethod: 'Prefix-based OEM routing â€” actual method determined by model number prefix',
      yearCodePosition: 'Varies by OEM manufacturer',
      monthCodePosition: 'Varies by OEM manufacturer',
      outputType: 'Year',
      decodeNotes: 'Kenmore does not manufacture its own appliances. Enter the first 3 digits of the model number to identify who made the unit. The serial number is then decoded using that manufacturer\'s own method.',
      exampleSerial: 'CB2501800',
      exampleResult: 'Decoded via OEM manufacturer identified by model prefix',
      sources: 'sears.com; appliancepartspros.com; repairclinic.com',
      method: 'Model prefix identifies OEM manufacturer; serial is decoded using that manufacturer\'s method',
      notes: 'Kenmore does not manufacture its own appliances. Enter the first 3 digits of the model number to identify who made the unit. The serial number is then decoded using that manufacturer\'s own method.',
      source: 'sears.com; appliancepartspros.com; repairclinic.com',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {},
      decode: function(serial) {
        // Fallback only â€” actual decode routes through OEM manufacturer decoder via KENMORE_PREFIX_TO_DECODER.
        // This function is reached only if OEM routing fails. Uses Whirlpool method as the most common default.
        if (!serial) return null;
        var letters = String(serial).match(/[A-Za-z]/g) || [];
        if (letters.length < 2) return null;
        var yearChar = letters[1].toUpperCase();
        var y = this.yearMap[yearChar];
        return { year: y || 'Unknown code: ' + yearChar, month: 'N/A', yearCode: yearChar };
      }
    }
    }
  };
  global.decoderData = global.decoderData || {};
  global.decoderData.appliances = categoryData;
})(window);
