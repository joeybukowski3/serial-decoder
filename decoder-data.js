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

// Serial Number Decoder Database â€” Auto-generated from CSV
// Generated: 2026-02-17
// Source of truth for runtime decoding; CSV files are not loaded by the app.

var decoderData = {
  appliances: {
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
      { id: 'ge', name: 'GE (including Cafe, Monogram, Profile, Hotpoint, RCA)' },
      { id: 'cafe', name: 'Cafe' },
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
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
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
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: 'Second alpha character = year code (letters only).',
      decodeMethod: 'Second alpha character = year code',
      yearCodePosition: 'Second alpha character',
      monthCodePosition: 'N/A',
      outputType: 'Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Second alpha character = year code',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
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
    'sub_zero': {
      name: 'Sub-Zero',
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: 'Second alpha character = year code (letters only).',
      decodeMethod: 'Second alpha character = year code',
      yearCodePosition: 'Second alpha character',
      monthCodePosition: 'N/A',
      outputType: 'Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Second alpha character = year code',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
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
    'hampton_bay': {
      name: 'Hampton Bay',
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: 'Second alpha character = year code (letters only).',
      decodeMethod: 'Second alpha character = year code',
      yearCodePosition: 'Second alpha character',
      monthCodePosition: 'N/A',
      outputType: 'Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Second alpha character = year code',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
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
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Second alpha character = year code',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
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
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Second alpha character = year code',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
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
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Second alpha character = year code',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
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
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Second alpha character = year code',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
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
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Second alpha character = year code',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
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
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Second alpha character = year code',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
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
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
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
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
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
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
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
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
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
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
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
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022, Week 25',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
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
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022, Week 25',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
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
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022, Week 25',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
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
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022, Week 25',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: 'Count only letters and numbers in the serial number. If the serial number has nine alphanumeric characters, the second character is the year and the third and fourth characters are the week. If the serial number has ten alphanumeric characters, the third character is the year and the fourth and fifth characters are the week.',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
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
      name: 'GE (including Cafe, Monogram, Profile, Hotpoint, RCA)',
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
      yearMap: { 'R': '2001/2021', 'T': '2002/2022', 'W': '2003/2023', 'X': '2004/2024', 'Y': '2005/2025', 'A': '2006/2026', 'P': '2007', 'Q': '2008', 'S': '2009', 'Z': '2010', 'B': '2011', 'C': '2012', 'D': '2013', 'F': '2014', 'G': '2015', 'H': '2016', 'J': '2017', 'K': '2018', 'M': '2019', 'N': '2020' },
      monthMap: { '1': 'January', '2': 'February', '3': 'March', '4': 'April', '5': 'May', '6': 'June', '7': 'July', '8': 'August', '9': 'September', 'A': 'October', 'B': 'November', 'C': 'December' },
            decode: function(serial) {
      if (!serial) return null;
      var len = serial.length;
      var yearChar = '';
      var monthChar = '';
      if (len >= 15) {
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
  },
  waterHeaters: {
    brands: [
      { id: 'a_o_smith', name: 'A.O. Smith' },
      { id: 'american_water_heater_company', name: 'American Water Heater Company' },
      { id: 'aqua_therm', name: 'Aqua Therm' },
      { id: 'bradford_white', name: 'Bradford White' },
      { id: 'cimarron', name: 'Cimarron' },
      { id: 'energy_master', name: 'Energy Master' },
      { id: 'ge_water_heaters', name: 'GE Water Heaters' },
      { id: 'gsw', name: 'GSW' },
      { id: 'intertherm_miller', name: 'Intertherm/Miller' },
      { id: 'montgomery_ward', name: 'Montgomery Ward' },
      { id: 'reliance_water_heaters', name: 'Reliance Water Heaters' },
      { id: 'rheem', name: 'Rheem' },
      { id: 'richmond', name: 'Richmond' },
      { id: 'ruud', name: 'Ruud' },
      { id: 'state_industries', name: 'State Industries' },
      { id: 'u_s_craftmaster', name: 'U.S. Craftmaster' },
      { id: 'vanguard', name: 'Vanguard' },
      { id: 'whirlpool_water_heaters', name: 'Whirlpool Water Heaters' }
    ],
    decoders: {
    'rheem': {
      name: 'Rheem',
      parentManufacturer: 'Rheem Manufacturing',
      groupId: '7A',
      products: 'Water Heater (tank)',
      serialEra: '1984-Present',
      serialLengthNote: 'Style 1 (most common post-1990): 10-digit serial. Format: MMYYXXXXXX. Some units use RH/RHx prefix + WWYY.',
      decodeMethod: 'Characters 3-4 (Style 1)',
      yearCodePosition: 'Characters 3-4 (Style 1)',
      monthCodePosition: 'Characters 1-2 (Style 1)',
      outputType: 'Month + Year',
      decodeNotes: 'Style 1 format MMYY is most common post-1990. Some Rheem serials include a prefix (RH or RHx). If present, ignore the prefix and read the next four digits as Week (WW) and Year (YY). Example: RHA251405618 => Week 25, Year 2014. Multiple serial styles exist for older units. GE water heaters use Rheem coding (manufactured by Rheem). Style 2: chars 2-3=week chars 4-5=year. Style 3: chars 3-4=week chars 5-6=year.',
      exampleSerial: '1291A39968',
      exampleResult: '12=December 91=1991 -> December 1991',
      sources: 'fastwaterheater.com; kcwaterheater.com; builderbuddy.com; final-analysis.com',
      method: 'Style 1 (most common post-1990): 10-digit serial. Format: MMYYXXXXXX. Some Rheem serials include RH/RHx prefix + WWYY.',
      notes: 'Style 1 format MMYY is most common post-1990. Some Rheem serials include a prefix (RH or RHx). If present, ignore the prefix and read the next four digits as Week (WW) and Year (YY). Example: RHA251405618 => Week 25, Year 2014. Multiple serial styles exist for older units. GE water heaters use Rheem coding (manufactured by Rheem). Style 2: chars 2-3=week chars 4-5=year. Style 3: chars 3-4=week chars 5-6=year.',
      source: 'fastwaterheater.com; kcwaterheater.com; builderbuddy.com; final-analysis.com',
      yearMap: { '84': '1984' },
      monthMap: { '10': 'October', '11': 'November', '12': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var s = String(serial).toUpperCase().replace(/\s+/g, '');

      function resolveTwoDigitYear(yy) {
        var currentYear = new Date().getFullYear();
        var yearNum = parseInt(yy, 10);
        if (isNaN(yearNum)) return null;
        var y2000 = 2000 + yearNum;
        var y1900 = 1900 + yearNum;
        if (y2000 >= 1980 && y2000 <= currentYear) return y2000;
        if (y2000 > currentYear && y1900 >= 1980 && y1900 <= currentYear) return y1900;
        if (y2000 < 1980 && y1900 >= 1980 && y1900 <= currentYear) return y1900;
        return null;
      }

      function decodeRhPrefixed(match, weekIdx, yearIdx) {
        if (!match) return null;
        var ww = match[weekIdx];
        var yy = match[yearIdx];
        var week = parseInt(ww, 10);
        if (!(week >= 1 && week <= 53)) return null;
        var fullYearPrefix = resolveTwoDigitYear(yy);
        if (!fullYearPrefix) return null;
        return { year: String(fullYearPrefix), month: 'Week ' + ww, yearCode: yy, weekDigits: ww };
      }

      // Try RH + WWYY first, then RHx + WWYY (x = optional plant/line code).
      var rhNoExtra = decodeRhPrefixed(s.match(/^RH(\d{2})(\d{2})([A-Z0-9].*)?$/), 1, 2);
      if (rhNoExtra) return rhNoExtra;
      var rhWithExtra = decodeRhPrefixed(s.match(/^RH([A-Z0-9])(\d{2})(\d{2})([A-Z0-9].*)?$/), 2, 3);
      if (rhWithExtra) return rhWithExtra;

      var monthStr = s.substring(0, 2);
      var yearDigits = s.substring(2, 4);
      var fullYear = parseInt(yearDigits) >= 84 ? '19' + yearDigits : '20' + yearDigits;
      var m = this.monthMap[monthStr];
      return { year: fullYear, month: m || 'Month ' + monthStr, yearCode: yearDigits, monthCode: monthStr };
    }
    },
    'ruud': {
      name: 'Ruud',
      parentManufacturer: 'Rheem Manufacturing',
      groupId: '7A',
      products: 'Water Heater (tank)',
      serialEra: '1984-Present',
      serialLengthNote: 'Style 1 (most common post-1990): 10-digit serial. Format: MMYYXXXXXX.',
      decodeMethod: 'Characters 3-4 (Style 1)',
      yearCodePosition: 'Characters 3-4 (Style 1)',
      monthCodePosition: 'Characters 1-2 (Style 1)',
      outputType: 'Month + Year',
      decodeNotes: 'Style 1 format MMYY is most common post-1990. Multiple serial styles exist for older units. GE water heaters use Rheem coding (manufactured by Rheem). Style 2: chars 2-3=week chars 4-5=year. Style 3: chars 3-4=week chars 5-6=year.',
      exampleSerial: '1291A39968',
      exampleResult: '12=December 91=1991 -> December 1991',
      sources: 'fastwaterheater.com; kcwaterheater.com; builderbuddy.com; final-analysis.com',
      method: 'Style 1 (most common post-1990): 10-digit serial. Format: MMYYXXXXXX.',
      notes: 'Style 1 format MMYY is most common post-1990. Multiple serial styles exist for older units. GE water heaters use Rheem coding (manufactured by Rheem). Style 2: chars 2-3=week chars 4-5=year. Style 3: chars 3-4=week chars 5-6=year.',
      source: 'fastwaterheater.com; kcwaterheater.com; builderbuddy.com; final-analysis.com',
      yearMap: { '84': '1984' },
      monthMap: { '10': 'October', '11': 'November', '12': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var monthStr = serial.substring(0, 2);
      var yearDigits = serial.substring(2, 4);
      var fullYear = parseInt(yearDigits) >= 84 ? '19' + yearDigits : '20' + yearDigits;
      var m = this.monthMap[monthStr];
      return { year: fullYear, month: m || 'Month ' + monthStr, yearCode: yearDigits, monthCode: monthStr };
    }
    },
    'richmond': {
      name: 'Richmond',
      parentManufacturer: 'Rheem Manufacturing',
      groupId: '7A',
      products: 'Water Heater (tank)',
      serialEra: '1984-Present',
      serialLengthNote: 'Style 1 (most common post-1990): 10-digit serial. Format: MMYYXXXXXX.',
      decodeMethod: 'Characters 3-4 (Style 1)',
      yearCodePosition: 'Characters 3-4 (Style 1)',
      monthCodePosition: 'Characters 1-2 (Style 1)',
      outputType: 'Month + Year',
      decodeNotes: 'Style 1 format MMYY is most common post-1990. Multiple serial styles exist for older units. GE water heaters use Rheem coding (manufactured by Rheem). Style 2: chars 2-3=week chars 4-5=year. Style 3: chars 3-4=week chars 5-6=year.',
      exampleSerial: '1291A39968',
      exampleResult: '12=December 91=1991 -> December 1991',
      sources: 'fastwaterheater.com; kcwaterheater.com; builderbuddy.com; final-analysis.com',
      method: 'Style 1 (most common post-1990): 10-digit serial. Format: MMYYXXXXXX.',
      notes: 'Style 1 format MMYY is most common post-1990. Multiple serial styles exist for older units. GE water heaters use Rheem coding (manufactured by Rheem). Style 2: chars 2-3=week chars 4-5=year. Style 3: chars 3-4=week chars 5-6=year.',
      source: 'fastwaterheater.com; kcwaterheater.com; builderbuddy.com; final-analysis.com',
      yearMap: { '84': '1984' },
      monthMap: { '10': 'October', '11': 'November', '12': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var monthStr = serial.substring(0, 2);
      var yearDigits = serial.substring(2, 4);
      var fullYear = parseInt(yearDigits) >= 84 ? '19' + yearDigits : '20' + yearDigits;
      var m = this.monthMap[monthStr];
      return { year: fullYear, month: m || 'Month ' + monthStr, yearCode: yearDigits, monthCode: monthStr };
    }
    },
    'vanguard': {
      name: 'Vanguard',
      parentManufacturer: 'Rheem Manufacturing',
      groupId: '7A',
      products: 'Water Heater (tank)',
      serialEra: '1984-Present',
      serialLengthNote: 'Style 1 (most common post-1990): 10-digit serial. Format: MMYYXXXXXX.',
      decodeMethod: 'Characters 3-4 (Style 1)',
      yearCodePosition: 'Characters 3-4 (Style 1)',
      monthCodePosition: 'Characters 1-2 (Style 1)',
      outputType: 'Month + Year',
      decodeNotes: 'Style 1 format MMYY is most common post-1990. Multiple serial styles exist for older units. GE water heaters use Rheem coding (manufactured by Rheem). Style 2: chars 2-3=week chars 4-5=year. Style 3: chars 3-4=week chars 5-6=year.',
      exampleSerial: '1291A39968',
      exampleResult: '12=December 91=1991 -> December 1991',
      sources: 'fastwaterheater.com; kcwaterheater.com; builderbuddy.com; final-analysis.com',
      method: 'Style 1 (most common post-1990): 10-digit serial. Format: MMYYXXXXXX.',
      notes: 'Style 1 format MMYY is most common post-1990. Multiple serial styles exist for older units. GE water heaters use Rheem coding (manufactured by Rheem). Style 2: chars 2-3=week chars 4-5=year. Style 3: chars 3-4=week chars 5-6=year.',
      source: 'fastwaterheater.com; kcwaterheater.com; builderbuddy.com; final-analysis.com',
      yearMap: { '84': '1984' },
      monthMap: { '10': 'October', '11': 'November', '12': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var monthStr = serial.substring(0, 2);
      var yearDigits = serial.substring(2, 4);
      var fullYear = parseInt(yearDigits) >= 84 ? '19' + yearDigits : '20' + yearDigits;
      var m = this.monthMap[monthStr];
      return { year: fullYear, month: m || 'Month ' + monthStr, yearCode: yearDigits, monthCode: monthStr };
    }
    },
    'ge_water_heaters': {
      name: 'GE Water Heaters',
      parentManufacturer: 'Rheem Manufacturing',
      groupId: '7A',
      products: 'Water Heater (tank)',
      serialEra: '1984-Present',
      serialLengthNote: 'Style 1 (most common post-1990): 10-digit serial. Format: MMYYXXXXXX.',
      decodeMethod: 'Characters 3-4 (Style 1)',
      yearCodePosition: 'Characters 3-4 (Style 1)',
      monthCodePosition: 'Characters 1-2 (Style 1)',
      outputType: 'Month + Year',
      decodeNotes: 'Style 1 format MMYY is most common post-1990. Multiple serial styles exist for older units. GE water heaters use Rheem coding (manufactured by Rheem). Style 2: chars 2-3=week chars 4-5=year. Style 3: chars 3-4=week chars 5-6=year.',
      exampleSerial: '1291A39968',
      exampleResult: '12=December 91=1991 -> December 1991',
      sources: 'fastwaterheater.com; kcwaterheater.com; builderbuddy.com; final-analysis.com',
      method: 'Style 1 (most common post-1990): 10-digit serial. Format: MMYYXXXXXX.',
      notes: 'Style 1 format MMYY is most common post-1990. Multiple serial styles exist for older units. GE water heaters use Rheem coding (manufactured by Rheem). Style 2: chars 2-3=week chars 4-5=year. Style 3: chars 3-4=week chars 5-6=year.',
      source: 'fastwaterheater.com; kcwaterheater.com; builderbuddy.com; final-analysis.com',
      yearMap: { '84': '1984' },
      monthMap: { '10': 'October', '11': 'November', '12': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var monthStr = serial.substring(0, 2);
      var yearDigits = serial.substring(2, 4);
      var fullYear = parseInt(yearDigits) >= 84 ? '19' + yearDigits : '20' + yearDigits;
      var m = this.monthMap[monthStr];
      return { year: fullYear, month: m || 'Month ' + monthStr, yearCode: yearDigits, monthCode: monthStr };
    }
    },
    'montgomery_ward': {
      name: 'Montgomery Ward',
      parentManufacturer: 'Rheem Manufacturing',
      groupId: '7A',
      products: 'Water Heater (tank)',
      serialEra: '1984-Present',
      serialLengthNote: 'Style 1 (most common post-1990): 10-digit serial. Format: MMYYXXXXXX.',
      decodeMethod: 'Characters 3-4 (Style 1)',
      yearCodePosition: 'Characters 3-4 (Style 1)',
      monthCodePosition: 'Characters 1-2 (Style 1)',
      outputType: 'Month + Year',
      decodeNotes: 'Style 1 format MMYY is most common post-1990. Multiple serial styles exist for older units. GE water heaters use Rheem coding (manufactured by Rheem). Style 2: chars 2-3=week chars 4-5=year. Style 3: chars 3-4=week chars 5-6=year.',
      exampleSerial: '1291A39968',
      exampleResult: '12=December 91=1991 -> December 1991',
      sources: 'fastwaterheater.com; kcwaterheater.com; builderbuddy.com; final-analysis.com',
      method: 'Style 1 (most common post-1990): 10-digit serial. Format: MMYYXXXXXX.',
      notes: 'Style 1 format MMYY is most common post-1990. Multiple serial styles exist for older units. GE water heaters use Rheem coding (manufactured by Rheem). Style 2: chars 2-3=week chars 4-5=year. Style 3: chars 3-4=week chars 5-6=year.',
      source: 'fastwaterheater.com; kcwaterheater.com; builderbuddy.com; final-analysis.com',
      yearMap: { '84': '1984' },
      monthMap: { '10': 'October', '11': 'November', '12': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var monthStr = serial.substring(0, 2);
      var yearDigits = serial.substring(2, 4);
      var fullYear = parseInt(yearDigits) >= 84 ? '19' + yearDigits : '20' + yearDigits;
      var m = this.monthMap[monthStr];
      return { year: fullYear, month: m || 'Month ' + monthStr, yearCode: yearDigits, monthCode: monthStr };
    }
    },
    'aqua_therm': {
      name: 'Aqua Therm',
      parentManufacturer: 'Rheem Manufacturing',
      groupId: '7A',
      products: 'Water Heater (tank)',
      serialEra: '1984-Present',
      serialLengthNote: 'Style 1 (most common post-1990): 10-digit serial. Format: MMYYXXXXXX.',
      decodeMethod: 'Characters 3-4 (Style 1)',
      yearCodePosition: 'Characters 3-4 (Style 1)',
      monthCodePosition: 'Characters 1-2 (Style 1)',
      outputType: 'Month + Year',
      decodeNotes: 'Style 1 format MMYY is most common post-1990. Multiple serial styles exist for older units. GE water heaters use Rheem coding (manufactured by Rheem). Style 2: chars 2-3=week chars 4-5=year. Style 3: chars 3-4=week chars 5-6=year.',
      exampleSerial: '1291A39968',
      exampleResult: '12=December 91=1991 -> December 1991',
      sources: 'fastwaterheater.com; kcwaterheater.com; builderbuddy.com; final-analysis.com',
      method: 'Style 1 (most common post-1990): 10-digit serial. Format: MMYYXXXXXX.',
      notes: 'Style 1 format MMYY is most common post-1990. Multiple serial styles exist for older units. GE water heaters use Rheem coding (manufactured by Rheem). Style 2: chars 2-3=week chars 4-5=year. Style 3: chars 3-4=week chars 5-6=year.',
      source: 'fastwaterheater.com; kcwaterheater.com; builderbuddy.com; final-analysis.com',
      yearMap: { '84': '1984' },
      monthMap: { '10': 'October', '11': 'November', '12': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var monthStr = serial.substring(0, 2);
      var yearDigits = serial.substring(2, 4);
      var fullYear = parseInt(yearDigits) >= 84 ? '19' + yearDigits : '20' + yearDigits;
      var m = this.monthMap[monthStr];
      return { year: fullYear, month: m || 'Month ' + monthStr, yearCode: yearDigits, monthCode: monthStr };
    }
    },
    'energy_master': {
      name: 'Energy Master',
      parentManufacturer: 'Rheem Manufacturing',
      groupId: '7A',
      products: 'Water Heater (tank)',
      serialEra: '1984-Present',
      serialLengthNote: 'Style 1 (most common post-1990): 10-digit serial. Format: MMYYXXXXXX.',
      decodeMethod: 'Characters 3-4 (Style 1)',
      yearCodePosition: 'Characters 3-4 (Style 1)',
      monthCodePosition: 'Characters 1-2 (Style 1)',
      outputType: 'Month + Year',
      decodeNotes: 'Style 1 format MMYY is most common post-1990. Multiple serial styles exist for older units. GE water heaters use Rheem coding (manufactured by Rheem). Style 2: chars 2-3=week chars 4-5=year. Style 3: chars 3-4=week chars 5-6=year.',
      exampleSerial: '1291A39968',
      exampleResult: '12=December 91=1991 -> December 1991',
      sources: 'fastwaterheater.com; kcwaterheater.com; builderbuddy.com; final-analysis.com',
      method: 'Style 1 (most common post-1990): 10-digit serial. Format: MMYYXXXXXX.',
      notes: 'Style 1 format MMYY is most common post-1990. Multiple serial styles exist for older units. GE water heaters use Rheem coding (manufactured by Rheem). Style 2: chars 2-3=week chars 4-5=year. Style 3: chars 3-4=week chars 5-6=year.',
      source: 'fastwaterheater.com; kcwaterheater.com; builderbuddy.com; final-analysis.com',
      yearMap: { '84': '1984' },
      monthMap: { '10': 'October', '11': 'November', '12': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var monthStr = serial.substring(0, 2);
      var yearDigits = serial.substring(2, 4);
      var fullYear = parseInt(yearDigits) >= 84 ? '19' + yearDigits : '20' + yearDigits;
      var m = this.monthMap[monthStr];
      return { year: fullYear, month: m || 'Month ' + monthStr, yearCode: yearDigits, monthCode: monthStr };
    }
    },
    'cimarron': {
      name: 'Cimarron',
      parentManufacturer: 'Rheem Manufacturing',
      groupId: '7A',
      products: 'Water Heater (tank)',
      serialEra: '1984-Present',
      serialLengthNote: 'Style 1 (most common post-1990): 10-digit serial. Format: MMYYXXXXXX.',
      decodeMethod: 'Characters 3-4 (Style 1)',
      yearCodePosition: 'Characters 3-4 (Style 1)',
      monthCodePosition: 'Characters 1-2 (Style 1)',
      outputType: 'Month + Year',
      decodeNotes: 'Style 1 format MMYY is most common post-1990. Multiple serial styles exist for older units. GE water heaters use Rheem coding (manufactured by Rheem). Style 2: chars 2-3=week chars 4-5=year. Style 3: chars 3-4=week chars 5-6=year.',
      exampleSerial: '1291A39968',
      exampleResult: '12=December 91=1991 -> December 1991',
      sources: 'fastwaterheater.com; kcwaterheater.com; builderbuddy.com; final-analysis.com',
      method: 'Style 1 (most common post-1990): 10-digit serial. Format: MMYYXXXXXX.',
      notes: 'Style 1 format MMYY is most common post-1990. Multiple serial styles exist for older units. GE water heaters use Rheem coding (manufactured by Rheem). Style 2: chars 2-3=week chars 4-5=year. Style 3: chars 3-4=week chars 5-6=year.',
      source: 'fastwaterheater.com; kcwaterheater.com; builderbuddy.com; final-analysis.com',
      yearMap: { '84': '1984' },
      monthMap: { '10': 'October', '11': 'November', '12': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var monthStr = serial.substring(0, 2);
      var yearDigits = serial.substring(2, 4);
      var fullYear = parseInt(yearDigits) >= 84 ? '19' + yearDigits : '20' + yearDigits;
      var m = this.monthMap[monthStr];
      return { year: fullYear, month: m || 'Month ' + monthStr, yearCode: yearDigits, monthCode: monthStr };
    }
    },
    'intertherm_miller': {
      name: 'Intertherm/Miller',
      parentManufacturer: 'Rheem Manufacturing',
      groupId: '7A',
      products: 'Water Heater (tank)',
      serialEra: '1984-Present',
      serialLengthNote: 'Style 1 (most common post-1990): 10-digit serial. Format: MMYYXXXXXX.',
      decodeMethod: 'Characters 3-4 (Style 1)',
      yearCodePosition: 'Characters 3-4 (Style 1)',
      monthCodePosition: 'Characters 1-2 (Style 1)',
      outputType: 'Month + Year',
      decodeNotes: 'Style 1 format MMYY is most common post-1990. Multiple serial styles exist for older units. GE water heaters use Rheem coding (manufactured by Rheem). Style 2: chars 2-3=week chars 4-5=year. Style 3: chars 3-4=week chars 5-6=year.',
      exampleSerial: '1291A39968',
      exampleResult: '12=December 91=1991 -> December 1991',
      sources: 'fastwaterheater.com; kcwaterheater.com; builderbuddy.com; final-analysis.com',
      method: 'Style 1 (most common post-1990): 10-digit serial. Format: MMYYXXXXXX.',
      notes: 'Style 1 format MMYY is most common post-1990. Multiple serial styles exist for older units. GE water heaters use Rheem coding (manufactured by Rheem). Style 2: chars 2-3=week chars 4-5=year. Style 3: chars 3-4=week chars 5-6=year.',
      source: 'fastwaterheater.com; kcwaterheater.com; builderbuddy.com; final-analysis.com',
      yearMap: { '84': '1984' },
      monthMap: { '10': 'October', '11': 'November', '12': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var monthStr = serial.substring(0, 2);
      var yearDigits = serial.substring(2, 4);
      var fullYear = parseInt(yearDigits) >= 84 ? '19' + yearDigits : '20' + yearDigits;
      var m = this.monthMap[monthStr];
      return { year: fullYear, month: m || 'Month ' + monthStr, yearCode: yearDigits, monthCode: monthStr };
    }
    },
    'a_o_smith': {
      name: 'A.O. Smith',
      parentManufacturer: 'A.O. Smith Corporation',
      groupId: '7B',
      products: 'Water Heater (tank)',
      serialEra: 'Pre-2008',
      serialLengthNote: 'Letter-coded format for 9-10 character serials: [Month letter][2-digit year][...]. Numeric format: [YY][WW][...] where YY = 2-digit year and WW = production week (01\u201353).',
      decodeMethod: 'Character 1 (month letter), characters 2-3 (year) for letter-coded serials',
      yearCodePosition: 'Characters 2-3 (letter-coded serials)',
      monthCodePosition: 'Character 1 (letter-coded serials)',
      outputType: 'Month + Year',
      decodeNotes: 'Reliance letter-coded month map: A=October, B=November, C=December, D=January, E=February, F=March, G=April, H=May, I=June, K=July, L=August, M=September. In this format, the first letter is month and the 2nd-3rd digits are year. Numeric serials can still use YYWW.',
      exampleSerial: 'A1405618 (letter-coded) or 1504A023527 (numeric YYWW)',
      exampleResult: 'A=October, 14=2014 \u2192 October 2014 | 15=2015, 04=week 4 \u2192 2015 week 4',
      sources: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      method: 'Letter-coded format: first letter is month code (A=Oct ... M=Sep), digits 2-3 are year. Numeric format can use YYWW.',
      notes: 'Reliance letter-coded month map: A=October, B=November, C=December, D=January, E=February, F=March, G=April, H=May, I=June, K=July, L=August, M=September. For this format, the first letter is month and the 2nd-3rd digits are year.',
      source: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      yearMap: { 'YY (e.g. 06 = 2006)': 'Prefix with 19XX or 20XX based on context', 'YYYY (e.g. 2018)': 'Read directly (e.g. 2018)' },
      monthMap: { 'A': 'October', 'B': 'November', 'C': 'December', 'D': 'January', 'E': 'February', 'F': 'March', 'G': 'April', 'H': 'May', 'I': 'June', 'K': 'July', 'L': 'August', 'M': 'September', '10': 'October', '11': 'November', '12': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var YEAR_NOW = new Date().getFullYear();
      // Pre-2008 format: starts with a letter â€” [Factory][Month code][2-digit year][...]
      if (/^[A-Za-z]/.test(serial)) {
        if (serial.length < 4) return null;
        var monthChar = serial[1].toUpperCase();
        var yearDigits = serial.substring(2, 4);
        if (!/^\d{2}$/.test(yearDigits)) return null;
        var yr = parseInt(yearDigits);
        var fullYear = yr >= 84 ? '19' + yearDigits : '20' + yearDigits;
        var m2 = this.monthMap[monthChar];
        return { year: fullYear, month: m2 || 'Unknown code: ' + monthChar, yearCode: yearDigits, monthCode: monthChar };
      }
      // Post-2008 numeric Format A: YYYYMM... â€” full 4-digit year (2000â€“present), then 2-digit month.
      if (/^\d{4}/.test(serial) && serial.length >= 6) {
        var yr4 = parseInt(serial.substring(0, 4));
        if (yr4 >= 2000 && yr4 <= YEAR_NOW) {
          var monthStr = serial.substring(4, 6);
          var m = this.monthMap[monthStr];
          return { year: String(yr4), month: m || 'Month ' + monthStr, yearCode: String(yr4), monthCode: monthStr };
        }
      }
      // Post-2008 numeric Format B: YYWW... â€” 2-digit year then 2-digit production week (01â€“53).
      var yy = serial.substring(0, 2);
      var ww = serial.substring(2, 4);
      if (/^\d{2}$/.test(yy) && /^\d{2}$/.test(ww)) {
        var yr2 = parseInt(yy);
        var fullYear2 = 2000 + yr2;
        if (fullYear2 >= 2000 && fullYear2 <= YEAR_NOW) {
          var week = parseInt(ww);
          if (week >= 1 && week <= 53) {
            return { year: String(fullYear2), month: 'Week ' + week, yearCode: yy, weekDigits: ww };
          }
        }
      }
      return null;
    }
    },
    'state_industries': {
      name: 'State Industries',
      parentManufacturer: 'A.O. Smith Corporation',
      groupId: '7B',
      products: 'Water Heater (tank)',
      serialEra: 'Pre-2008',
      serialLengthNote: 'Letter-coded format: [Month letter][2-digit year][...]. Numeric format: [YY][WW][...] where YY = 2-digit year and WW = production week (01\u201353).',
      decodeMethod: 'Character 1 (month letter), characters 2-3 (year) for letter-coded serials',
      yearCodePosition: 'Characters 2-3 (letter-coded serials)',
      monthCodePosition: 'Character 1 (letter-coded serials)',
      outputType: 'Month + Year',
      decodeNotes: 'Reliance letter-coded month map: A=October, B=November, C=December, D=January, E=February, F=March, G=April, H=May, I=June, K=July, L=August, M=September. In this format, the first letter is month and the 2nd-3rd digits are year. Numeric serials can still use YYWW.',
      exampleSerial: 'A1405618 (letter-coded) or 1504A023527 (numeric YYWW)',
      exampleResult: 'A=October, 14=2014 \u2192 October 2014 | 15=2015, 04=week 4 \u2192 2015 week 4',
      sources: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      method: 'Letter-coded format: first letter is month code (A=Oct ... M=Sep), digits 2-3 are year. Numeric format can use YYWW.',
      notes: 'Reliance letter-coded month map: A=October, B=November, C=December, D=January, E=February, F=March, G=April, H=May, I=June, K=July, L=August, M=September. For this format, the first letter is month and the 2nd-3rd digits are year.',
      source: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      yearMap: { 'YY (e.g. 06 = 2006)': 'Prefix with 19XX or 20XX based on context', 'YYYY (e.g. 2018)': 'Read directly (e.g. 2018)' },
      monthMap: { 'A': 'October', 'B': 'November', 'C': 'December', 'D': 'January', 'E': 'February', 'F': 'March', 'G': 'April', 'H': 'May', 'I': 'June', 'K': 'July', 'L': 'August', 'M': 'September', '10': 'October', '11': 'November', '12': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var YEAR_NOW = new Date().getFullYear();
      // Pre-2008 format: starts with a letter â€” [Factory][Month code][2-digit year][...]
      if (/^[A-Za-z]/.test(serial)) {
        if (serial.length < 4) return null;
        var monthChar = serial[1].toUpperCase();
        var yearDigits = serial.substring(2, 4);
        if (!/^\d{2}$/.test(yearDigits)) return null;
        var yr = parseInt(yearDigits);
        var fullYear = yr >= 84 ? '19' + yearDigits : '20' + yearDigits;
        var m2 = this.monthMap[monthChar];
        return { year: fullYear, month: m2 || 'Unknown code: ' + monthChar, yearCode: yearDigits, monthCode: monthChar };
      }
      // Post-2008 numeric Format A: YYYYMM... â€” full 4-digit year (2000â€“present), then 2-digit month.
      if (/^\d{4}/.test(serial) && serial.length >= 6) {
        var yr4 = parseInt(serial.substring(0, 4));
        if (yr4 >= 2000 && yr4 <= YEAR_NOW) {
          var monthStr = serial.substring(4, 6);
          var m = this.monthMap[monthStr];
          return { year: String(yr4), month: m || 'Month ' + monthStr, yearCode: String(yr4), monthCode: monthStr };
        }
      }
      // Post-2008 numeric Format B: YYWW... â€” 2-digit year then 2-digit production week (01â€“53).
      var yy = serial.substring(0, 2);
      var ww = serial.substring(2, 4);
      if (/^\d{2}$/.test(yy) && /^\d{2}$/.test(ww)) {
        var yr2 = parseInt(yy);
        var fullYear2 = 2000 + yr2;
        if (fullYear2 >= 2000 && fullYear2 <= YEAR_NOW) {
          var week = parseInt(ww);
          if (week >= 1 && week <= 53) {
            return { year: String(fullYear2), month: 'Week ' + week, yearCode: yy, weekDigits: ww };
          }
        }
      }
      return null;
    }
    },
    'reliance_water_heaters': {
      name: 'Reliance Water Heaters',
      parentManufacturer: 'A.O. Smith Corporation',
      groupId: '7B',
      products: 'Water Heater (tank)',
      serialEra: 'Pre-2008',
      serialLengthNote: 'Letter-coded format: [Month letter][2-digit year][...]. Numeric format: [YY][WW][...] where YY = 2-digit year and WW = production week (01\u201353).',
      decodeMethod: 'Character 1 (month letter), characters 2-3 (year) for letter-coded serials',
      yearCodePosition: 'Characters 2-3 (letter-coded serials)',
      monthCodePosition: 'Character 1 (letter-coded serials)',
      outputType: 'Month + Year',
      decodeNotes: 'Reliance letter-coded month map: A=October, B=November, C=December, D=January, E=February, F=March, G=April, H=May, I=June, K=July, L=August, M=September. In this format, the first letter is month and the 2nd-3rd digits are year. Numeric serials can still use YYWW.',
      exampleSerial: 'A1405618 (letter-coded) or 1504A023527 (numeric YYWW)',
      exampleResult: 'A=October, 14=2014 \u2192 October 2014 | 15=2015, 04=week 4 \u2192 2015 week 4',
      sources: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      method: 'Letter-coded format: first letter is month code (A=Oct ... M=Sep), digits 2-3 are year. Numeric format can use YYWW.',
      notes: 'Reliance letter-coded month map: A=October, B=November, C=December, D=January, E=February, F=March, G=April, H=May, I=June, K=July, L=August, M=September. For this format, the first letter is month and the 2nd-3rd digits are year.',
      source: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      yearMap: { 'YY (e.g. 06 = 2006)': 'Prefix with 19XX or 20XX based on context', 'YYYY (e.g. 2018)': 'Read directly (e.g. 2018)' },
      monthMap: { 'A': 'October', 'B': 'November', 'C': 'December', 'D': 'January', 'E': 'February', 'F': 'March', 'G': 'April', 'H': 'May', 'I': 'June', 'K': 'July', 'L': 'August', 'M': 'September', '10': 'October', '11': 'November', '12': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var YEAR_NOW = new Date().getFullYear();
      // Reliance letter-coded format applies to 9- and 10-character serials:
      // [Month letter][2-digit year][...]
      if (/^[A-Za-z]/.test(serial) && (serial.length === 9 || serial.length === 10)) {
        if (serial.length < 4) return null;
        var monthChar = serial[0].toUpperCase();
        var yearDigits = serial.substring(1, 3);
        if (!/^\d{2}$/.test(yearDigits)) return null;
        var yr = parseInt(yearDigits);
        var fullYear = yr >= 84 ? '19' + yearDigits : '20' + yearDigits;
        var m2 = this.monthMap[monthChar];
        return { year: fullYear, month: m2 || 'Unknown code: ' + monthChar, yearCode: yearDigits, monthCode: monthChar };
      }
      // Post-2008 numeric Format A: YYYYMM... â€” full 4-digit year (2000â€“present), then 2-digit month.
      if (/^\d{4}/.test(serial) && serial.length >= 6) {
        var yr4 = parseInt(serial.substring(0, 4));
        if (yr4 >= 2000 && yr4 <= YEAR_NOW) {
          var monthStr = serial.substring(4, 6);
          var m = this.monthMap[monthStr];
          return { year: String(yr4), month: m || 'Month ' + monthStr, yearCode: String(yr4), monthCode: monthStr };
        }
      }
      // Post-2008 numeric Format B: YYWW... â€” 2-digit year then 2-digit production week (01â€“53).
      var yy = serial.substring(0, 2);
      var ww = serial.substring(2, 4);
      if (/^\d{2}$/.test(yy) && /^\d{2}$/.test(ww)) {
        var yr2 = parseInt(yy);
        var fullYear2 = 2000 + yr2;
        if (fullYear2 >= 2000 && fullYear2 <= YEAR_NOW) {
          var week = parseInt(ww);
          if (week >= 1 && week <= 53) {
            return { year: String(fullYear2), month: 'Week ' + week, yearCode: yy, weekDigits: ww };
          }
        }
      }
      return null;
    }
    },
    'american_water_heater_company': {
      name: 'American Water Heater Company',
      parentManufacturer: 'A.O. Smith Corporation',
      groupId: '7B',
      products: 'Water Heater (tank)',
      serialEra: 'Pre-2008',
      serialLengthNote: 'Pre-2008 format: [Factory letter][Month code][2-digit year][...]. Post-2008 format: [YY][WW][...] where YY = 2-digit year (e.g. 15 = 2015) and WW = production week (01\u201353).',
      decodeMethod: 'Characters 3-4 (pre-2008 era)',
      yearCodePosition: 'Characters 3-4 (pre-2008 era)',
      monthCodePosition: 'Character 2 (pre-2008 era)',
      outputType: 'Month + Year',
      decodeNotes: 'I is skipped in month codes (pre-2008). Post-2008 serials: first 2 digits = year (20XX, e.g. 15 = 2015), next 2 digits = production week (01\u201353). If the first 4 digits form a valid 4-digit calendar year (e.g. 2018), they are read directly as year + month. AO Smith acquired State Industries and American Water Heater in 2001.',
      exampleSerial: 'BG9908XXXXX (pre-2008) or 1504A023527 (post-2008)',
      exampleResult: 'B=factory, G=July, 99=1999 \u2192 July 1999 | 15=2015, 04=week 4 \u2192 2015 week 4',
      sources: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      method: 'Pre-2008 format: [Factory letter][Month code][2-digit year][...]. Post-2008 format: [YY][WW][...] where YY = 2-digit year (e.g. 15 = 2015) and WW = production week (01\u201353).',
      notes: 'I is skipped in month codes (pre-2008). Post-2008 serials: first 2 digits = year (20XX, e.g. 15 = 2015), next 2 digits = production week (01\u201353). If the first 4 digits form a valid 4-digit calendar year (e.g. 2018), they are read directly as year + month. AO Smith acquired State Industries and American Water Heater in 2001.',
      source: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      yearMap: { 'YY (e.g. 06 = 2006)': 'Prefix with 19XX or 20XX based on context', 'YYYY (e.g. 2018)': 'Read directly (e.g. 2018)' },
      monthMap: { '10': 'October', '11': 'November', '12': 'December', 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'J': 'September', 'K': 'October', 'L': 'November', 'M': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var YEAR_NOW = new Date().getFullYear();
      // Pre-2008 format: starts with a letter â€” [Factory][Month code][2-digit year][...]
      if (/^[A-Za-z]/.test(serial)) {
        if (serial.length < 4) return null;
        var monthChar = serial[1].toUpperCase();
        var yearDigits = serial.substring(2, 4);
        if (!/^\d{2}$/.test(yearDigits)) return null;
        var yr = parseInt(yearDigits);
        var fullYear = yr >= 84 ? '19' + yearDigits : '20' + yearDigits;
        var m2 = this.monthMap[monthChar];
        return { year: fullYear, month: m2 || 'Unknown code: ' + monthChar, yearCode: yearDigits, monthCode: monthChar };
      }
      // Post-2008 numeric Format A: YYYYMM... â€” full 4-digit year (2000â€“present), then 2-digit month.
      if (/^\d{4}/.test(serial) && serial.length >= 6) {
        var yr4 = parseInt(serial.substring(0, 4));
        if (yr4 >= 2000 && yr4 <= YEAR_NOW) {
          var monthStr = serial.substring(4, 6);
          var m = this.monthMap[monthStr];
          return { year: String(yr4), month: m || 'Month ' + monthStr, yearCode: String(yr4), monthCode: monthStr };
        }
      }
      // Post-2008 numeric Format B: YYWW... â€” 2-digit year then 2-digit production week (01â€“53).
      var yy = serial.substring(0, 2);
      var ww = serial.substring(2, 4);
      if (/^\d{2}$/.test(yy) && /^\d{2}$/.test(ww)) {
        var yr2 = parseInt(yy);
        var fullYear2 = 2000 + yr2;
        if (fullYear2 >= 2000 && fullYear2 <= YEAR_NOW) {
          var week = parseInt(ww);
          if (week >= 1 && week <= 53) {
            return { year: String(fullYear2), month: 'Week ' + week, yearCode: yy, weekDigits: ww };
          }
        }
      }
      return null;
    }
    },
    'u_s_craftmaster': {
      name: 'U.S. Craftmaster',
      parentManufacturer: 'A.O. Smith Corporation',
      groupId: '7B',
      products: 'Water Heater (tank)',
      serialEra: 'Pre-2008',
      serialLengthNote: 'Pre-2008 format: [Factory letter][Month code][2-digit year][...]. Post-2008 format: [YY][WW][...] where YY = 2-digit year (e.g. 15 = 2015) and WW = production week (01\u201353).',
      decodeMethod: 'Characters 3-4 (pre-2008 era)',
      yearCodePosition: 'Characters 3-4 (pre-2008 era)',
      monthCodePosition: 'Character 2 (pre-2008 era)',
      outputType: 'Month + Year',
      decodeNotes: 'I is skipped in month codes (pre-2008). Post-2008 serials: first 2 digits = year (20XX, e.g. 15 = 2015), next 2 digits = production week (01\u201353). If the first 4 digits form a valid 4-digit calendar year (e.g. 2018), they are read directly as year + month. AO Smith acquired State Industries and American Water Heater in 2001.',
      exampleSerial: 'BG9908XXXXX (pre-2008) or 1504A023527 (post-2008)',
      exampleResult: 'B=factory, G=July, 99=1999 \u2192 July 1999 | 15=2015, 04=week 4 \u2192 2015 week 4',
      sources: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      method: 'Pre-2008 format: [Factory letter][Month code][2-digit year][...]. Post-2008 format: [YY][WW][...] where YY = 2-digit year (e.g. 15 = 2015) and WW = production week (01\u201353).',
      notes: 'I is skipped in month codes (pre-2008). Post-2008 serials: first 2 digits = year (20XX, e.g. 15 = 2015), next 2 digits = production week (01\u201353). If the first 4 digits form a valid 4-digit calendar year (e.g. 2018), they are read directly as year + month. AO Smith acquired State Industries and American Water Heater in 2001.',
      source: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      yearMap: { 'YY (e.g. 06 = 2006)': 'Prefix with 19XX or 20XX based on context', 'YYYY (e.g. 2018)': 'Read directly (e.g. 2018)' },
      monthMap: { '10': 'October', '11': 'November', '12': 'December', 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'J': 'September', 'K': 'October', 'L': 'November', 'M': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var YEAR_NOW = new Date().getFullYear();
      // Pre-2008 format: starts with a letter â€” [Factory][Month code][2-digit year][...]
      if (/^[A-Za-z]/.test(serial)) {
        if (serial.length < 4) return null;
        var monthChar = serial[1].toUpperCase();
        var yearDigits = serial.substring(2, 4);
        if (!/^\d{2}$/.test(yearDigits)) return null;
        var yr = parseInt(yearDigits);
        var fullYear = yr >= 84 ? '19' + yearDigits : '20' + yearDigits;
        var m2 = this.monthMap[monthChar];
        return { year: fullYear, month: m2 || 'Unknown code: ' + monthChar, yearCode: yearDigits, monthCode: monthChar };
      }
      // Post-2008 numeric Format A: YYYYMM... â€” full 4-digit year (2000â€“present), then 2-digit month.
      if (/^\d{4}/.test(serial) && serial.length >= 6) {
        var yr4 = parseInt(serial.substring(0, 4));
        if (yr4 >= 2000 && yr4 <= YEAR_NOW) {
          var monthStr = serial.substring(4, 6);
          var m = this.monthMap[monthStr];
          return { year: String(yr4), month: m || 'Month ' + monthStr, yearCode: String(yr4), monthCode: monthStr };
        }
      }
      // Post-2008 numeric Format B: YYWW... â€” 2-digit year then 2-digit production week (01â€“53).
      var yy = serial.substring(0, 2);
      var ww = serial.substring(2, 4);
      if (/^\d{2}$/.test(yy) && /^\d{2}$/.test(ww)) {
        var yr2 = parseInt(yy);
        var fullYear2 = 2000 + yr2;
        if (fullYear2 >= 2000 && fullYear2 <= YEAR_NOW) {
          var week = parseInt(ww);
          if (week >= 1 && week <= 53) {
            return { year: String(fullYear2), month: 'Week ' + week, yearCode: yy, weekDigits: ww };
          }
        }
      }
      return null;
    }
    },
    'gsw': {
      name: 'GSW',
      parentManufacturer: 'A.O. Smith Corporation',
      groupId: '7B',
      products: 'Water Heater (tank)',
      serialEra: 'Pre-2008',
      serialLengthNote: 'Pre-2008 format: [Factory letter][Month code][2-digit year][...]. Post-2008 format: [YY][WW][...] where YY = 2-digit year (e.g. 15 = 2015) and WW = production week (01\u201353).',
      decodeMethod: 'Characters 3-4 (pre-2008 era)',
      yearCodePosition: 'Characters 3-4 (pre-2008 era)',
      monthCodePosition: 'Character 2 (pre-2008 era)',
      outputType: 'Month + Year',
      decodeNotes: 'I is skipped in month codes (pre-2008). Post-2008 serials: first 2 digits = year (20XX, e.g. 15 = 2015), next 2 digits = production week (01\u201353). If the first 4 digits form a valid 4-digit calendar year (e.g. 2018), they are read directly as year + month. AO Smith acquired State Industries and American Water Heater in 2001.',
      exampleSerial: 'BG9908XXXXX (pre-2008) or 1504A023527 (post-2008)',
      exampleResult: 'B=factory, G=July, 99=1999 \u2192 July 1999 | 15=2015, 04=week 4 \u2192 2015 week 4',
      sources: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      method: 'Pre-2008 format: [Factory letter][Month code][2-digit year][...]. Post-2008 format: [YY][WW][...] where YY = 2-digit year (e.g. 15 = 2015) and WW = production week (01\u201353).',
      notes: 'I is skipped in month codes (pre-2008). Post-2008 serials: first 2 digits = year (20XX, e.g. 15 = 2015), next 2 digits = production week (01\u201353). If the first 4 digits form a valid 4-digit calendar year (e.g. 2018), they are read directly as year + month. AO Smith acquired State Industries and American Water Heater in 2001.',
      source: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      yearMap: { 'YY (e.g. 06 = 2006)': 'Prefix with 19XX or 20XX based on context', 'YYYY (e.g. 2018)': 'Read directly (e.g. 2018)' },
      monthMap: { '10': 'October', '11': 'November', '12': 'December', 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'J': 'September', 'K': 'October', 'L': 'November', 'M': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var YEAR_NOW = new Date().getFullYear();
      // Pre-2008 format: starts with a letter â€” [Factory][Month code][2-digit year][...]
      if (/^[A-Za-z]/.test(serial)) {
        if (serial.length < 4) return null;
        var monthChar = serial[1].toUpperCase();
        var yearDigits = serial.substring(2, 4);
        if (!/^\d{2}$/.test(yearDigits)) return null;
        var yr = parseInt(yearDigits);
        var fullYear = yr >= 84 ? '19' + yearDigits : '20' + yearDigits;
        var m2 = this.monthMap[monthChar];
        return { year: fullYear, month: m2 || 'Unknown code: ' + monthChar, yearCode: yearDigits, monthCode: monthChar };
      }
      // Post-2008 numeric Format A: YYYYMM... â€” full 4-digit year (2000â€“present), then 2-digit month.
      if (/^\d{4}/.test(serial) && serial.length >= 6) {
        var yr4 = parseInt(serial.substring(0, 4));
        if (yr4 >= 2000 && yr4 <= YEAR_NOW) {
          var monthStr = serial.substring(4, 6);
          var m = this.monthMap[monthStr];
          return { year: String(yr4), month: m || 'Month ' + monthStr, yearCode: String(yr4), monthCode: monthStr };
        }
      }
      // Post-2008 numeric Format B: YYWW... â€” 2-digit year then 2-digit production week (01â€“53).
      var yy = serial.substring(0, 2);
      var ww = serial.substring(2, 4);
      if (/^\d{2}$/.test(yy) && /^\d{2}$/.test(ww)) {
        var yr2 = parseInt(yy);
        var fullYear2 = 2000 + yr2;
        if (fullYear2 >= 2000 && fullYear2 <= YEAR_NOW) {
          var week = parseInt(ww);
          if (week >= 1 && week <= 53) {
            return { year: String(fullYear2), month: 'Week ' + week, yearCode: yy, weekDigits: ww };
          }
        }
      }
      return null;
    }
    },
    'whirlpool_water_heaters': {
      name: 'Whirlpool Water Heaters',
      parentManufacturer: 'A.O. Smith Corporation',
      groupId: '7B',
      products: 'Water Heater (tank)',
      serialEra: 'Pre-2008',
      serialLengthNote: 'Pre-2008 format: [Factory letter][Month code][2-digit year][...]. Post-2008 format: [YY][WW][...] where YY = 2-digit year (e.g. 15 = 2015) and WW = production week (01\u201353).',
      decodeMethod: 'Characters 3-4 (pre-2008 era)',
      yearCodePosition: 'Characters 3-4 (pre-2008 era)',
      monthCodePosition: 'Character 2 (pre-2008 era)',
      outputType: 'Month + Year',
      decodeNotes: 'I is skipped in month codes (pre-2008). Post-2008 serials: first 2 digits = year (20XX, e.g. 15 = 2015), next 2 digits = production week (01\u201353). If the first 4 digits form a valid 4-digit calendar year (e.g. 2018), they are read directly as year + month. AO Smith acquired State Industries and American Water Heater in 2001.',
      exampleSerial: 'BG9908XXXXX (pre-2008) or 1504A023527 (post-2008)',
      exampleResult: 'B=factory, G=July, 99=1999 \u2192 July 1999 | 15=2015, 04=week 4 \u2192 2015 week 4',
      sources: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      method: 'Pre-2008 format: [Factory letter][Month code][2-digit year][...]. Post-2008 format: [YY][WW][...] where YY = 2-digit year (e.g. 15 = 2015) and WW = production week (01\u201353).',
      notes: 'I is skipped in month codes (pre-2008). Post-2008 serials: first 2 digits = year (20XX, e.g. 15 = 2015), next 2 digits = production week (01\u201353). If the first 4 digits form a valid 4-digit calendar year (e.g. 2018), they are read directly as year + month. AO Smith acquired State Industries and American Water Heater in 2001.',
      source: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      yearMap: { 'YY (e.g. 06 = 2006)': 'Prefix with 19XX or 20XX based on context', 'YYYY (e.g. 2018)': 'Read directly (e.g. 2018)' },
      monthMap: { '10': 'October', '11': 'November', '12': 'December', 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'J': 'September', 'K': 'October', 'L': 'November', 'M': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var YEAR_NOW = new Date().getFullYear();
      // Pre-2008 format: starts with a letter â€” [Factory][Month code][2-digit year][...]
      if (/^[A-Za-z]/.test(serial)) {
        if (serial.length < 4) return null;
        var monthChar = serial[1].toUpperCase();
        var yearDigits = serial.substring(2, 4);
        if (!/^\d{2}$/.test(yearDigits)) return null;
        var yr = parseInt(yearDigits);
        var fullYear = yr >= 84 ? '19' + yearDigits : '20' + yearDigits;
        var m2 = this.monthMap[monthChar];
        return { year: fullYear, month: m2 || 'Unknown code: ' + monthChar, yearCode: yearDigits, monthCode: monthChar };
      }
      // Post-2008 numeric Format A: YYYYMM... â€” full 4-digit year (2000â€“present), then 2-digit month.
      if (/^\d{4}/.test(serial) && serial.length >= 6) {
        var yr4 = parseInt(serial.substring(0, 4));
        if (yr4 >= 2000 && yr4 <= YEAR_NOW) {
          var monthStr = serial.substring(4, 6);
          var m = this.monthMap[monthStr];
          return { year: String(yr4), month: m || 'Month ' + monthStr, yearCode: String(yr4), monthCode: monthStr };
        }
      }
      // Post-2008 numeric Format B: YYWW... â€” 2-digit year then 2-digit production week (01â€“53).
      var yy = serial.substring(0, 2);
      var ww = serial.substring(2, 4);
      if (/^\d{2}$/.test(yy) && /^\d{2}$/.test(ww)) {
        var yr2 = parseInt(yy);
        var fullYear2 = 2000 + yr2;
        if (fullYear2 >= 2000 && fullYear2 <= YEAR_NOW) {
          var week = parseInt(ww);
          if (week >= 1 && week <= 53) {
            return { year: String(fullYear2), month: 'Week ' + week, yearCode: yy, weekDigits: ww };
          }
        }
      }
      return null;
    }
    },
    'bradford_white': {
      name: 'Bradford White',
      parentManufacturer: 'Bradford White Corporation (independent)',
      groupId: '7C',
      products: 'Water Heater (tank)',
      serialEra: '1984-Present',
      serialLengthNote: '9 or 10-character serial. Format: [Year letter][Month letter][7 or 8-digit sequence].',
      decodeMethod: 'Characters 1-2 (Character 1 = year using 20-year rotating letter code, Character 2 = month using letter code)',
      yearCodePosition: 'Character 1',
      monthCodePosition: 'Character 2',
      outputType: 'Month + Year',
      decodeNotes: '20-year repeating cycle. Letters I O Q R U V never used EXCEPT: a computer error produced \'O\' prefix units in January 1997 only. Resolve ambiguity using ANSI compliance date on rating plate (revised every 6-8 years). Bradford White is independently owned and does not sell under other brand names.',
      exampleSerial: 'HG4829551',
      exampleResult: 'H=1991 or 2011 + G=July -> July 1991 or 2011',
      sources: 'forthepro.bradfordwhite.com; hotwatersolutionsnw.org; building-center.org; waterheaterhub.com',
      method: 'Characters 1-2 (Character 1 = year using 20-year rotating letter code, Character 2 = month using letter code)',
      notes: '20-year repeating cycle. Letters I O Q R U V never used EXCEPT: a computer error produced \'O\' prefix units in January 1997 only. Resolve ambiguity using ANSI compliance date on rating plate (revised every 6-8 years). Bradford White is independently owned and does not sell under other brand names.',
      source: 'forthepro.bradfordwhite.com; hotwatersolutionsnw.org; building-center.org; waterheaterhub.com',
      yearMap: { 'A': '1984 or 2004/2024', 'B': '1985 or 2005/2025', 'C': '1986 or 2006/2026', 'D': '1987 or 2007', 'E': '1988 or 2008', 'F': '1989 or 2009', 'G': '1990 or 2010', 'H': '1991 or 2011', 'J': '1992 or 2012', 'K': '1993 or 2013', 'L': '1994 or 2014', 'M': '1995 or 2015', 'N': '1996 or 2016', 'P': '1997 or 2017', 'S': '1998 or 2018', 'T': '1999 or 2019', 'W': '2000 or 2020', 'X': '2001 or 2021', 'Y': '2002 or 2022', 'Z': '2003 or 2023' },
      monthMap: { 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'J': 'September', 'K': 'October', 'L': 'November', 'M': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 2) return null;
      var yearChar = serial[0].toUpperCase();
      var monthChar = serial[1].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar, yearCode: yearChar, monthCode: monthChar };
    }
    }
    }
  },
  hvac: {
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
      sources: 'Manufacturer Technical Specifications',
      method: 'First two digits represent the year and the next two digits represent the month. Source: Manufacturer Technical Specifications.',
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
      sources: 'Manufacturer Technical Specifications',
      method: 'First two digits represent the year and the next two digits represent the month. Source: Manufacturer Technical Specifications.',
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
      decodeMethod: 'Digits 3-4 (year). Source: Manufacturer Technical Specifications.',
      yearCodePosition: 'Digits 3-4',
      monthCodePosition: 'N/A',
      outputType: 'Year',
      decodeNotes: 'Digits 3-4 represent the year.',
      exampleSerial: 'XX19XXXX',
      exampleResult: '19=2019',
      sources: 'Manufacturer Technical Specifications',
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
      var currentTwo = new Date().getFullYear() % 100;
      var fullYear = (yearNum > currentTwo ? 1900 : 2000) + yearNum;
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
      sources: 'Manufacturer Technical Specifications',
      method: 'First two digits represent the production week; next two digits represent the year. Source: Manufacturer Technical Specifications.',
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
      var currentTwo = new Date().getFullYear() % 100;
      var fullYear = (yearNum > currentTwo ? 1900 : 2000) + yearNum;
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
      sources: 'Manufacturer Technical Specifications',
      method: 'First two digits represent the production week; next two digits represent the year. Source: Manufacturer Technical Specifications.',
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
      var currentTwo = new Date().getFullYear() % 100;
      var fullYear = (yearNum > currentTwo ? 1900 : 2000) + yearNum;
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
      sources: 'Manufacturer Technical Specifications',
      method: 'Four digits following a letter represent week and year (WWYY). Source: Manufacturer Technical Specifications.',
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
      var currentTwo = new Date().getFullYear() % 100;
      var fullYear = (yearNum > currentTwo ? 1900 : 2000) + yearNum;
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
      sources: 'Manufacturer Technical Specifications',
      method: 'Four digits following a letter represent week and year (WWYY). Source: Manufacturer Technical Specifications.',
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
      var currentTwo = new Date().getFullYear() % 100;
      var fullYear = (yearNum > currentTwo ? 1900 : 2000) + yearNum;
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
      sources: 'Manufacturer Technical Specifications',
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
      var currentTwo = new Date().getFullYear() % 100;
      var fullYear = (yearNum > currentTwo ? 1900 : 2000) + yearNum;
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
      sources: 'Manufacturer Technical Specifications',
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
      var currentTwo = new Date().getFullYear() % 100;
      var fullYear = (yearNum > currentTwo ? 1900 : 2000) + yearNum;
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
      sources: 'Manufacturer Technical Specifications',
      method: 'First two digits represent the production week; next two digits represent the year. Source: Manufacturer Technical Specifications.',
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
      var currentTwo = new Date().getFullYear() % 100;
      var fullYear = (yearNum > currentTwo ? 1900 : 2000) + yearNum;
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
      sources: 'Manufacturer Technical Specifications',
      method: 'First two digits represent the production week; next two digits represent the year. Source: Manufacturer Technical Specifications.',
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
      var currentTwo = new Date().getFullYear() % 100;
      var fullYear = (yearNum > currentTwo ? 1900 : 2000) + yearNum;
      return { year: String(fullYear), month: 'Week ' + ww, yearCode: yy, weekDigits: ww };
    }
    }
    }
  },
  electronics: {
    brands: [
      { id: 'apple', name: 'Apple' },
      { id: 'samsung_tv', name: 'Samsung (TVs & Monitors)' },
      { id: 'samsung_phone', name: 'Samsung (Phones & Tablets)' },
      { id: 'lg_tv', name: 'LG' },
      { id: 'hp', name: 'HP' },
      { id: 'asus', name: 'ASUS' },
      { id: 'google_pixel', name: 'Google Pixel' },
      { id: 'sony', name: 'Sony' },
      { id: 'vizio', name: 'Vizio' },
      { id: 'panasonic', name: 'Panasonic' },
    ],
    decoders: {
    'samsung_tv': {
      name: 'Samsung Electronics',
      parentManufacturer: 'Samsung Electronics Co., Ltd.',
      groupId: '4A',
      products: 'TV; Monitor; Soundbar; Home Theater; Tablet; Camera',
      serialEra: '2001-Present',
      serialLengthNote: '15-char serial: year at char 8, month at char 9. 11-char serial: year at char 4, month at char 5.',
      decodeMethod: 'Char 8 (15-digit serial) or Char 4 (11-digit serial)',
      yearCodePosition: 'Char 8 (15-digit serial) or Char 4 (11-digit serial)',
      monthCodePosition: 'Char 9 (15-digit) or Char 5 (11-digit)',
      outputType: 'Month + Year',
      decodeNotes: 'Samsung TVs, monitors, and home theater devices use the same serial format as Samsung appliances. Serial number is on a label on the back of the device or on the original box. Some year codes repeat every 20 years (R, T, W, X, Y, A).',
      exampleSerial: '07R5CAHJB001234',
      exampleResult: 'J=2017 B=November',
      sources: 'homespy.io; electrical-forensics.com; samsung.com',
      method: '15-char serial: year at char 8, month at char 9. 11-char serial: year at char 4, month at char 5.',
      notes: 'Samsung TVs and monitors use the same serial format as Samsung appliances. Serial label is on the back of the device. Some codes have a 20-year cycle â€” verify decade using model generation or condition.',
      source: 'homespy.io; electrical-forensics.com; samsung.com',
      yearMap: { 'R': '2001/2021', 'T': '2002/2022', 'W': '2003/2023', 'X': '2004/2024', 'Y': '2005/2025', 'A': '2006/2026', 'P': '2007', 'Q': '2008', 'S': '2009', 'Z': '2010', 'B': '2011', 'C': '2012', 'D': '2013', 'F': '2014', 'G': '2015', 'H': '2016', 'J': '2017', 'K': '2018', 'M': '2019', 'N': '2020' },
      monthMap: { '1': 'January', '2': 'February', '3': 'March', '4': 'April', '5': 'May', '6': 'June', '7': 'July', '8': 'August', '9': 'September', 'A': 'October', 'B': 'November', 'C': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 5) return null;
      var yearPos, monthPos;
      if (serial.length >= 15) { yearPos = 7; monthPos = 8; }
      else { yearPos = 3; monthPos = 4; }
      var yearChar = serial[yearPos].toUpperCase();
      var monthChar = serial[monthPos].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar, yearCode: yearChar, monthCode: monthChar };
    }
    },
    'lg_tv': {
      name: 'LG Electronics',
      parentManufacturer: 'LG Electronics Inc.',
      groupId: '4B',
      products: 'TV; Monitor; Soundbar; Home Theater; Projector',
      serialEra: '2000-Present',
      serialLengthNote: 'Serial: [Year digit][2-digit month code][remaining alphanumeric]',
      decodeMethod: 'Character 1',
      yearCodePosition: 'Character 1',
      monthCodePosition: 'Characters 2-3',
      outputType: 'Month + Year',
      decodeNotes: 'LG TVs and monitors use the same serial format as LG appliances. Serial number is on the back of the device or on the original box. Decade must be inferred from physical condition or model research.',
      exampleSerial: '310MR12345678',
      exampleResult: '3=2003/2013/2023 10=October',
      sources: 'homespy.io; lumayeconsulting.com; lg.com',
      method: 'Serial: [Year digit][2-digit month code][remaining alphanumeric]',
      notes: 'LG TVs use the same serial format as LG appliances. Serial is on the back of the unit. Decade must be inferred from physical condition or model history.',
      source: 'homespy.io; lumayeconsulting.com; lg.com',
      yearMap: { '0': '2000/2010/2020', '1': '2001/2011/2021', '2': '2002/2012/2022', '3': '2003/2013/2023', '4': '2004/2014/2024', '5': '2005/2015/2025', '6': '2006/2016', '7': '2007/2017', '8': '2008/2018', '9': '2009/2019' },
      monthMap: { '10': 'October', '11': 'November', '12': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 5) return null;
      var yearDigit = serial[0];
      var monthCode = serial.substring(1, 3).toUpperCase();
      var y = this.yearMap[yearDigit];
      var m = this.monthMap[monthCode];
      return { year: y || 'Unknown code: ' + yearDigit, month: m || 'Unknown code: ' + monthCode, yearCode: yearDigit, monthCode: monthCode };
    }
    },
    'apple': {
      name: 'Apple',
      parentManufacturer: 'Apple Inc.',
      products: 'iPhone; iPad; Mac; iPod; Apple Watch',
      serialEra: '2010-Present',
      serialLengthNote: '12-char (pre-2021): year at char 4, week at chars 5-6. 10-char (post-2021): randomized serial â€” no date encoding.',
      method: '12-char serial: char 4 = Year, chars 5-6 = Week. 10-char serial (post-2021): randomized.',
      notes: 'Apple moved to randomized 10-character serials around 2021. For randomized serials, year cannot be decoded directly â€” use Smart Lookup with the model identifier (e.g., A2341). Year codes C and D each map to two possible decades (2010 or 2020).',
      decodeNotes: 'Apple moved to randomized serials (~2021). For those, Smart Lookup with the model number gives the best result.',
      exampleSerial: 'C02XG1JFJGH5',
      exampleResult: 'G=2011, Week 1J (~Week 27)',
      yearMap: {
        'C': '2010/2020', 'D': '2010/2020', 'F': '2011', 'G': '2011',
        'H': '2012', 'J': '2012', 'K': '2013', 'L': '2013',
        'M': '2014', 'N': '2014', 'P': '2015', 'Q': '2015',
        'R': '2016', 'S': '2016', 'T': '2017', 'V': '2017',
        'W': '2018', 'X': '2019', 'Y': '2019', 'Z': '2020'
      },
      monthMap: {},
      decode: function(serial) {
        var s = serial.replace(/\s/g, '');
        if (s.length === 10) {
          return {
            year: 'Post-2021 (Randomized)',
            month: 'Apple serial numbers after ~2021 may be randomized. Try Smart Lookup with the model number (e.g., A2341).',
            yearCode: null, weekDigits: null
          };
        }
        if (s.length < 6) return null;
        var yearChar = s[3].toUpperCase();
        var weekChars = s.substring(4, 6);
        var y = this.yearMap[yearChar];
        return { year: y || 'Unknown code: ' + yearChar, month: 'Week ' + weekChars, yearCode: yearChar, weekDigits: weekChars };
      }
    },
    'samsung_phone': {
      name: 'Samsung (Phones & Tablets)',
      parentManufacturer: 'Samsung Electronics Co., Ltd.',
      products: 'Galaxy Phone; Galaxy Tablet; Galaxy Watch',
      serialEra: '2009-Present',
      serialLengthNote: '15-char serial: year at char 8, month at char 9. Shorter serials: year at char 4, month at char 5.',
      method: '15-char serial: char 8 = Year. Shorter serials: char 4 = Year. Next char = Month.',
      notes: 'Year codes B, C, D, E repeat â€” B=2009 or 2022, C=2010 or 2023, D=2011 or 2024, E=2012 or 2025. Use device model generation to confirm decade.',
      decodeNotes: 'Some year codes have a 13-year cycle. Use device generation to resolve ambiguity.',
      exampleSerial: 'RX1K304XXXXXXX',
      exampleResult: 'K=2016 3=March',
      yearMap: {
        'B': '2009/2022', 'C': '2010/2023', 'D': '2011/2024', 'E': '2012/2025',
        'F': '2013', 'G': '2014', 'H': '2015', 'J': '2015',
        'K': '2016', 'M': '2017', 'N': '2018', 'R': '2019',
        'T': '2020', 'A': '2021'
      },
      monthMap: { '1': 'January', '2': 'February', '3': 'March', '4': 'April', '5': 'May', '6': 'June', '7': 'July', '8': 'August', '9': 'September', 'A': 'October', 'B': 'November', 'C': 'December' },
      decode: function(serial) {
        var s = serial.replace(/\s/g, '').toUpperCase();
        if (s.length < 5) return null;
        var yearPos = s.length >= 15 ? 7 : 3;
        var monthPos = yearPos + 1;
        var yearChar = s[yearPos];
        var monthChar = monthPos < s.length ? s[monthPos] : '';
        var y = this.yearMap[yearChar];
        var m = this.monthMap[monthChar] || '';
        return { year: y || 'Unknown code: ' + yearChar, month: m || (monthChar ? 'Code: ' + monthChar : ''), yearCode: yearChar, monthCode: monthChar || undefined };
      }
    },
    'hp': {
      name: 'HP',
      parentManufacturer: 'HP Inc.',
      products: 'Laptop; Desktop; Workstation; Printer',
      serialEra: '2000s-Present',
      serialLengthNote: 'Serial: char 4 = Year (last digit), chars 5-6 = Week (01-52).',
      method: 'Char 4 = Year last digit, chars 5-6 = Week number (01-52).',
      notes: 'HP encodes only the last digit of the manufacture year. Use device model generation and condition to determine the full year (e.g., 7 = 2007 or 2017).',
      decodeNotes: 'HP year codes are decade-ambiguous. Use device features or model lineup to confirm the full year.',
      exampleSerial: 'CNX7120BXX',
      exampleResult: '7=2017 Week 12',
      yearMap: {
        '0': '2010/2020', '1': '2011/2021', '2': '2012/2022', '3': '2013/2023',
        '4': '2014/2024', '5': '2015/2025', '6': '2016/2026',
        '7': '2007/2017', '8': '2008/2018', '9': '2009/2019'
      },
      monthMap: {},
      decode: function(serial) {
        var s = serial.replace(/\s/g, '');
        if (s.length < 6) return null;
        var yearDigit = s[3];
        var weekChars = s.substring(4, 6);
        var weekNum = parseInt(weekChars, 10);
        var y = this.yearMap[yearDigit];
        var weekText = (!isNaN(weekNum) && weekNum >= 1 && weekNum <= 53)
          ? ('Week ' + weekChars)
          : ('Week code: ' + weekChars + ' (outside 01-53; year decoded only)');
        return { year: y || 'Year digit: ' + yearDigit + ' (decade unknown)', month: weekText, yearCode: yearDigit, weekDigits: weekChars };
      }
    },
    'asus': {
      name: 'ASUS',
      parentManufacturer: 'ASUSTeK Computer Inc.',
      products: 'Laptop; Desktop; Motherboard; Monitor',
      serialEra: '2010-Present',
      serialLengthNote: 'Serial: char 1 = Year, char 2 = Month.',
      method: 'Char 1 = Year (alpha code), char 2 = Month (1-9 = Jan-Sep, A=Oct, B=Nov, C=Dec).',
      notes: 'ASUS skips letters I, O, and Q in the year code sequence to avoid visual confusion with 1, 0.',
      decodeNotes: 'ASUS encodes year and month cleanly in the first two characters. No decade ambiguity.',
      exampleSerial: 'N3A1234567',
      exampleResult: 'N=2022 3=March',
      yearMap: {
        'A': '2010', 'B': '2011', 'C': '2012', 'D': '2013', 'E': '2014', 'F': '2015',
        'G': '2016', 'H': '2017', 'J': '2018', 'K': '2019', 'L': '2020',
        'M': '2021', 'N': '2022', 'P': '2023', 'R': '2024', 'S': '2025'
      },
      monthMap: { '1': 'January', '2': 'February', '3': 'March', '4': 'April', '5': 'May', '6': 'June', '7': 'July', '8': 'August', '9': 'September', 'A': 'October', 'B': 'November', 'C': 'December' },
      decode: function(serial) {
        var s = serial.replace(/\s/g, '').toUpperCase();
        if (s.length < 2) return null;
        var yearChar = s[0];
        var monthChar = s[1];
        var y = this.yearMap[yearChar];
        var m = this.monthMap[monthChar];
        return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar, yearCode: yearChar, monthCode: monthChar };
      }
    },
    'google_pixel': {
      name: 'Google Pixel',
      parentManufacturer: 'Google LLC',
      products: 'Pixel Phone; Pixel Tablet; Pixel Watch',
      serialEra: '2016-Present',
      serialLengthNote: 'Serial: char 1 = Year (last digit), chars 2-3 = Week (01-53).',
      method: 'Char 1 = Year last digit, chars 2-3 = Week number (01-53).',
      notes: 'Google Pixel launched in 2016. Year digits 0-5 map to 2020-2025; digits 6-9 map to 2016-2019. Week 08 = approximately late February.',
      decodeNotes: 'Year decade can typically be inferred from the Pixel model number (Pixel 6, 7, 8, 9, etc.).',
      exampleSerial: '408XXXXXXXXX',
      exampleResult: '4=2024, Week 08 (~February)',
      yearMap: {
        '6': '2016', '7': '2017', '8': '2018', '9': '2019',
        '0': '2020', '1': '2021', '2': '2022', '3': '2023', '4': '2024', '5': '2025'
      },
      monthMap: {},
      decode: function(serial) {
        var s = serial.replace(/\s/g, '');
        if (s.length < 3) return null;
        var yearDigit = s[0];
        var weekChars = s.substring(1, 3);
        var weekNum = parseInt(weekChars, 10);
        if (isNaN(weekNum) || weekNum < 1 || weekNum > 53) return null;
        var y = this.yearMap[yearDigit];
        return { year: y || 'Unknown code: ' + yearDigit, month: 'Week ' + weekChars, yearCode: yearDigit, weekDigits: weekChars };
      }
    },
    'sony': {
      name: 'Sony',
      parentManufacturer: 'Sony Corporation',
      products: 'Bravia TV; OLED TV; Home Theater',
      serialEra: '2020-Present',
      serialLengthNote: 'Enter the MODEL number (not serial). The final letter of the model number encodes the year.',
      method: 'Last letter of MODEL number encodes year: H=2020, J=2021, K=2022, L=2023, M=2024, N=2025.',
      notes: 'Sony TVs encode the manufacture year in the last letter of the model number, not in the serial number. Enter your full model number (e.g., XR65A90K) to decode. Serial numbers alone do not contain the manufacture year.',
      decodeNotes: 'Sony uses model suffix dating. Enter the model number (found on the back of the TV) to get the year.',
      exampleSerial: 'XR65A90K',
      exampleResult: 'K=2022',
      suffixMap: { 'H': '2020', 'J': '2021', 'K': '2022', 'L': '2023', 'M': '2024', 'N': '2025' },
      yearMap: {},
      monthMap: {},
      decode: function(serial) {
        var s = serial.replace(/\s/g, '').toUpperCase();
        if (!s) return null;
        var lastChar = s[s.length - 1];
        var y = this.suffixMap[lastChar];
        if (y) {
          return { year: y, month: 'Model suffix: ' + lastChar, yearCode: lastChar, weekDigits: undefined };
        }
        return {
          year: 'No year suffix found',
          month: 'Enter a Sony model number ending in H, J, K, L, M, or N â€” e.g., XR65A90K for a 2022 TV.',
          yearCode: lastChar, weekDigits: undefined
        };
      }
    },
    'vizio': {
      name: 'Vizio',
      parentManufacturer: 'Vizio Inc.',
      products: 'TV; Soundbar',
      serialEra: '2010-Present',
      serialLengthNote: 'Serial: chars 4-5 encode year and week (format varies by series â€” YYWW or WWYY).',
      method: 'Chars 4-5 = Year/Week code. Decoded using YYWW and WWYY heuristics; verify with model info.',
      notes: 'Vizio serial number formats vary by TV series. The decoder applies a best-effort heuristic to chars 4-5. If both interpretations are plausible, both are shown. Always verify with Vizio model documentation.',
      decodeNotes: 'Vizio formats vary by series. Treat decoded results as estimates and verify when possible.',
      exampleSerial: 'LFTREP23',
      exampleResult: 'Chars 4-5: E=year hint, P=week hint (heuristic)',
      yearMap: {},
      monthMap: {},
      decode: function(serial) {
        var s = serial.replace(/\s/g, '');
        if (s.length < 5) return null;
        var c4 = s[3];
        var c5 = s[4];
        var n4 = parseInt(c4, 10);
        var n5 = parseInt(c5, 10);
        if (isNaN(n4) || isNaN(n5)) {
          return { year: 'Non-numeric code', month: 'Vizio format varies by series - chars 4-5 are "' + c4 + c5 + '". Verify with model documentation.', yearCode: c4 + c5 };
        }
        var results = [];
        var y1 = (n4 <= 6) ? '202' + c4 : '201' + c4;
        if (n5 >= 1 && n5 <= 9) results.push(y1 + ', Week ' + c5 + 'x (YYWW read)');
        var y2 = (n5 <= 6) ? '202' + c5 : '201' + c5;
        if (n4 >= 1 && n4 <= 9) results.push('Week ' + c4 + 'x, ' + y2 + ' (WWYY read)');
        if (results.length === 0) {
          return { year: 'Unable to decode', month: 'Codes "' + c4 + c5 + '" do not match known Vizio patterns. Verify with model documentation.', yearCode: c4 + c5 };
        }
        return { year: results.length === 2 ? 'Ambiguous - see note' : (n4 <= 6 ? y1 : y2), month: results.join(' - OR - ') + '. Vizio formats vary; verify with model info.', yearCode: c4 + c5 };
      }
    },
    'panasonic': {
      name: 'Panasonic',
      parentManufacturer: 'Panasonic Holdings Corporation',
      products: 'TV; Projector; Home Theater',
      serialEra: '2010-Present',
      serialLengthNote: 'Serial: char 1 = Year (last digit), char 2 = Month/Factory code.',
      method: 'Char 1 = Year last digit. Char 2 = Month or factory code (mapping varies by product line).',
      notes: 'Panasonic encodes the last digit of the manufacture year in the first character. The second character represents a month or factory/production-line code depending on the product line. Use device condition and model generation to determine the full year.',
      decodeNotes: 'Panasonic year is decade-ambiguous. Use device generation or model lineup to confirm full year.',
      exampleSerial: '4B123456',
      exampleResult: '4=2014/2024, B=factory/month code',
      yearMap: {
        '0': '2010/2020', '1': '2011/2021', '2': '2012/2022', '3': '2013/2023',
        '4': '2014/2024', '5': '2015/2025', '6': '2016/2026',
        '7': '2007/2017', '8': '2008/2018', '9': '2009/2019'
      },
      monthMap: {},
      decode: function(serial) {
        var s = serial.replace(/\s/g, '');
        if (s.length < 2) return null;
        var yearDigit = s[0];
        var factoryChar = s[1];
        var y = this.yearMap[yearDigit];
        return { year: y || 'Year digit: ' + yearDigit + ' (decade unknown)', month: 'Factory/month code: ' + factoryChar + ' (varies by product line)', yearCode: yearDigit, weekDigits: undefined };
      }
    }
    }
  }
};







