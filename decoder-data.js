// Serial Number Decoder Database — Auto-generated from CSV
// Generated: 2026-02-17

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
      { id: 'ge', name: 'GE' },
      { id: 'ge_caf', name: 'GE Café' },
      { id: 'ge_monogram', name: 'GE Monogram' },
      { id: 'ge_profile', name: 'GE Profile' },
      { id: 'gibson', name: 'Gibson' },
      { id: 'hotpoint', name: 'Hotpoint' },
      { id: 'inglis', name: 'Inglis' },
      { id: 'jenn_air_post_2006', name: 'Jenn-Air (post-2006)' },
      { id: 'jenn_air_pre_2006', name: 'Jenn-Air (pre-2006)' },
      { id: 'kelvinator', name: 'Kelvinator' },
      { id: 'kenmore', name: 'Kenmore' },
      { id: 'kitchenaid', name: 'KitchenAid' },
      { id: 'lg', name: 'LG' },
      { id: 'maytag_post_2006', name: 'Maytag (post-2006)' },
      { id: 'maytag_pre_2006', name: 'Maytag (pre-2006)' },
      { id: 'rca', name: 'RCA' },
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
      serialLengthNote: '9-digit: year at char 2. 10-digit: year at char 3. Week follows year code (next 2 digits).',
      decodeMethod: 'Char 2 (9-digit) or Char 3 (10-digit)',
      yearCodePosition: 'Char 2 (9-digit) or Char 3 (10-digit)',
      monthCodePosition: 'N/A',
      outputType: 'Year + Week of Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022 Week 25 (~June)',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: '9-digit: year at char 2. 10-digit: year at char 3. Week follows year code (next 2 digits).',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      source: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var yearChar, week;
      if (serial.length <= 9) { yearChar = serial[1]; week = serial.substring(2,4); }
      else { yearChar = serial[2]; week = serial.substring(3,5); }
      var y = this.yearMap[yearChar.toUpperCase()];
      return { year: y || 'Unknown code: ' + yearChar, month: 'Week ' + week };
    }
    },
    'kitchenaid': {
      name: 'KitchenAid',
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: '9-digit: year at char 2. 10-digit: year at char 3. Week follows year code (next 2 digits).',
      decodeMethod: 'Char 2 (9-digit) or Char 3 (10-digit)',
      yearCodePosition: 'Char 2 (9-digit) or Char 3 (10-digit)',
      monthCodePosition: 'N/A',
      outputType: 'Year + Week of Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022 Week 25 (~June)',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: '9-digit: year at char 2. 10-digit: year at char 3. Week follows year code (next 2 digits).',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      source: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var yearChar, week;
      if (serial.length <= 9) { yearChar = serial[1]; week = serial.substring(2,4); }
      else { yearChar = serial[2]; week = serial.substring(3,5); }
      var y = this.yearMap[yearChar.toUpperCase()];
      return { year: y || 'Unknown code: ' + yearChar, month: 'Week ' + week };
    }
    },
    'roper': {
      name: 'Roper',
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: '9-digit: year at char 2. 10-digit: year at char 3. Week follows year code (next 2 digits).',
      decodeMethod: 'Char 2 (9-digit) or Char 3 (10-digit)',
      yearCodePosition: 'Char 2 (9-digit) or Char 3 (10-digit)',
      monthCodePosition: 'N/A',
      outputType: 'Year + Week of Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022 Week 25 (~June)',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: '9-digit: year at char 2. 10-digit: year at char 3. Week follows year code (next 2 digits).',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      source: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var yearChar, week;
      if (serial.length <= 9) { yearChar = serial[1]; week = serial.substring(2,4); }
      else { yearChar = serial[2]; week = serial.substring(3,5); }
      var y = this.yearMap[yearChar.toUpperCase()];
      return { year: y || 'Unknown code: ' + yearChar, month: 'Week ' + week };
    }
    },
    'estate': {
      name: 'Estate',
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: '9-digit: year at char 2. 10-digit: year at char 3. Week follows year code (next 2 digits).',
      decodeMethod: 'Char 2 (9-digit) or Char 3 (10-digit)',
      yearCodePosition: 'Char 2 (9-digit) or Char 3 (10-digit)',
      monthCodePosition: 'N/A',
      outputType: 'Year + Week of Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022 Week 25 (~June)',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: '9-digit: year at char 2. 10-digit: year at char 3. Week follows year code (next 2 digits).',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      source: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var yearChar, week;
      if (serial.length <= 9) { yearChar = serial[1]; week = serial.substring(2,4); }
      else { yearChar = serial[2]; week = serial.substring(3,5); }
      var y = this.yearMap[yearChar.toUpperCase()];
      return { year: y || 'Unknown code: ' + yearChar, month: 'Week ' + week };
    }
    },
    'inglis': {
      name: 'Inglis',
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: '9-digit: year at char 2. 10-digit: year at char 3. Week follows year code (next 2 digits).',
      decodeMethod: 'Char 2 (9-digit) or Char 3 (10-digit)',
      yearCodePosition: 'Char 2 (9-digit) or Char 3 (10-digit)',
      monthCodePosition: 'N/A',
      outputType: 'Year + Week of Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022 Week 25 (~June)',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: '9-digit: year at char 2. 10-digit: year at char 3. Week follows year code (next 2 digits).',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      source: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var yearChar, week;
      if (serial.length <= 9) { yearChar = serial[1]; week = serial.substring(2,4); }
      else { yearChar = serial[2]; week = serial.substring(3,5); }
      var y = this.yearMap[yearChar.toUpperCase()];
      return { year: y || 'Unknown code: ' + yearChar, month: 'Week ' + week };
    }
    },
    'crosley': {
      name: 'Crosley',
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: '9-digit: year at char 2. 10-digit: year at char 3. Week follows year code (next 2 digits).',
      decodeMethod: 'Char 2 (9-digit) or Char 3 (10-digit)',
      yearCodePosition: 'Char 2 (9-digit) or Char 3 (10-digit)',
      monthCodePosition: 'N/A',
      outputType: 'Year + Week of Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022 Week 25 (~June)',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: '9-digit: year at char 2. 10-digit: year at char 3. Week follows year code (next 2 digits).',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      source: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var yearChar, week;
      if (serial.length <= 9) { yearChar = serial[1]; week = serial.substring(2,4); }
      else { yearChar = serial[2]; week = serial.substring(3,5); }
      var y = this.yearMap[yearChar.toUpperCase()];
      return { year: y || 'Unknown code: ' + yearChar, month: 'Week ' + week };
    }
    },
    'maytag_post_2006': {
      name: 'Maytag (post-2006)',
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: '9-digit: year at char 2. 10-digit: year at char 3. Week follows year code (next 2 digits).',
      decodeMethod: 'Char 2 (9-digit) or Char 3 (10-digit)',
      yearCodePosition: 'Char 2 (9-digit) or Char 3 (10-digit)',
      monthCodePosition: 'N/A',
      outputType: 'Year + Week of Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022 Week 25 (~June)',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: '9-digit: year at char 2. 10-digit: year at char 3. Week follows year code (next 2 digits).',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      source: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var yearChar, week;
      if (serial.length <= 9) { yearChar = serial[1]; week = serial.substring(2,4); }
      else { yearChar = serial[2]; week = serial.substring(3,5); }
      var y = this.yearMap[yearChar.toUpperCase()];
      return { year: y || 'Unknown code: ' + yearChar, month: 'Week ' + week };
    }
    },
    'jenn_air_post_2006': {
      name: 'Jenn-Air (post-2006)',
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: '9-digit: year at char 2. 10-digit: year at char 3. Week follows year code (next 2 digits).',
      decodeMethod: 'Char 2 (9-digit) or Char 3 (10-digit)',
      yearCodePosition: 'Char 2 (9-digit) or Char 3 (10-digit)',
      monthCodePosition: 'N/A',
      outputType: 'Year + Week of Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022 Week 25 (~June)',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: '9-digit: year at char 2. 10-digit: year at char 3. Week follows year code (next 2 digits).',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      source: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var yearChar, week;
      if (serial.length <= 9) { yearChar = serial[1]; week = serial.substring(2,4); }
      else { yearChar = serial[2]; week = serial.substring(3,5); }
      var y = this.yearMap[yearChar.toUpperCase()];
      return { year: y || 'Unknown code: ' + yearChar, month: 'Week ' + week };
    }
    },
    'amana_post_2006': {
      name: 'Amana (post-2006)',
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: '9-digit: year at char 2. 10-digit: year at char 3. Week follows year code (next 2 digits).',
      decodeMethod: 'Char 2 (9-digit) or Char 3 (10-digit)',
      yearCodePosition: 'Char 2 (9-digit) or Char 3 (10-digit)',
      monthCodePosition: 'N/A',
      outputType: 'Year + Week of Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022 Week 25 (~June)',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: '9-digit: year at char 2. 10-digit: year at char 3. Week follows year code (next 2 digits).',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      source: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var yearChar, week;
      if (serial.length <= 9) { yearChar = serial[1]; week = serial.substring(2,4); }
      else { yearChar = serial[2]; week = serial.substring(3,5); }
      var y = this.yearMap[yearChar.toUpperCase()];
      return { year: y || 'Unknown code: ' + yearChar, month: 'Week ' + week };
    }
    },
    'admiral_post_2006': {
      name: 'Admiral (post-2006)',
      parentManufacturer: 'Whirlpool Corporation',
      groupId: '1A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1990-Present',
      serialLengthNote: '9-digit: year at char 2. 10-digit: year at char 3. Week follows year code (next 2 digits).',
      decodeMethod: 'Char 2 (9-digit) or Char 3 (10-digit)',
      yearCodePosition: 'Char 2 (9-digit) or Char 3 (10-digit)',
      monthCodePosition: 'N/A',
      outputType: 'Year + Week of Year',
      decodeNotes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      exampleSerial: 'CB2501800',
      exampleResult: 'B=1992/2022 Week 25 (~June)',
      sources: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      method: '9-digit: year at char 2. 10-digit: year at char 3. Week follows year code (next 2 digits).',
      notes: '30-year repeating cycle. Use appliance condition and features to resolve decade. Letters I O Q V are skipped.',
      source: 'electrical-forensics.com; homespy.io; partsdr.com; fixya.com',
      yearMap: { '0': '2010/2040', '1': '2011/2041', '2': '2012/2042', '3': '2013/2043', '4': '2014/2044', '5': '2015/2045', '6': '2016/2046', '7': '2017/2047', '8': '2018/2048', '9': '2019/2049', 'X': '1990/2020', 'A': '1991/2021', 'B': '1992/2022', 'C': '1993/2023', 'D': '1994/2024', 'E': '1995/2025', 'F': '1996/2026', 'G': '1997/2027', 'H': '1998/2028', 'J': '1999/2029', 'K': '2000/2030', 'L': '2001/2031', 'M': '2002/2032', 'P': '2003/2033', 'R': '2004/2034', 'S': '2005/2035', 'T': '2006/2036', 'U': '2007/2037', 'W': '2008/2038', 'Y': '2009/2039' },
      monthMap: {  },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var yearChar, week;
      if (serial.length <= 9) { yearChar = serial[1]; week = serial.substring(2,4); }
      else { yearChar = serial[2]; week = serial.substring(3,5); }
      var y = this.yearMap[yearChar.toUpperCase()];
      return { year: y || 'Unknown code: ' + yearChar, month: 'Week ' + week };
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
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar };
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
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar };
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
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar };
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
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar };
    }
    },
    'ge': {
      name: 'GE',
      parentManufacturer: 'GE Appliances (owned by Haier since 2016)',
      groupId: '2',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1977-Present',
      serialLengthNote: 'Serial begins with 2 letters followed by 6 digits and optional suffix.',
      decodeMethod: 'Character 2 (second letter)',
      yearCodePosition: 'Character 2 (second letter)',
      monthCodePosition: 'Character 1 (first letter)',
      outputType: 'Month + Year',
      decodeNotes: '12-year repeating cycle. GE water heaters manufactured by Rheem — use Group 7A. Haier-era units (post-2016) continue using same format.',
      exampleSerial: 'RG527327B',
      exampleResult: 'R=August G=1980/1992/2004/2016',
      sources: 'products.geappliances.com; cannonsappliance.com; lumayeconsulting.com; en.tab-tv.com',
      method: 'Serial begins with 2 letters followed by 6 digits and optional suffix.',
      notes: '12-year repeating cycle. GE water heaters manufactured by Rheem — use Group 7A. Haier-era units (post-2016) continue using same format.',
      source: 'products.geappliances.com; cannonsappliance.com; lumayeconsulting.com; en.tab-tv.com',
      yearMap: { 'A': '1977/1989/2001/2013/2025', 'D': '1978/1990/2002/2014/2026', 'F': '1979/1991/2003/2015', 'G': '1980/1992/2004/2016', 'H': '1981/1993/2005/2017', 'L': '1982/1994/2006/2018', 'M': '1983/1995/2007/2019', 'R': '1984/1996/2008/2020', 'S': '1985/1997/2009/2021', 'T': '1986/1998/2010/2022', 'V': '1987/1999/2011/2023', 'Z': '1988/2000/2012/2024' },
      monthMap: { 'A': 'January', 'D': 'February', 'F': 'March', 'G': 'April', 'H': 'May', 'L': 'June', 'M': 'July', 'R': 'August', 'S': 'September', 'T': 'October', 'V': 'November', 'Z': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 2) return null;
      var monthChar = serial[0].toUpperCase();
      var yearChar = serial[1].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar };
    }
    },
    'ge_profile': {
      name: 'GE Profile',
      parentManufacturer: 'GE Appliances (owned by Haier since 2016)',
      groupId: '2',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1977-Present',
      serialLengthNote: 'Serial begins with 2 letters followed by 6 digits and optional suffix.',
      decodeMethod: 'Character 2 (second letter)',
      yearCodePosition: 'Character 2 (second letter)',
      monthCodePosition: 'Character 1 (first letter)',
      outputType: 'Month + Year',
      decodeNotes: '12-year repeating cycle. GE water heaters manufactured by Rheem — use Group 7A. Haier-era units (post-2016) continue using same format.',
      exampleSerial: 'RG527327B',
      exampleResult: 'R=August G=1980/1992/2004/2016',
      sources: 'products.geappliances.com; cannonsappliance.com; lumayeconsulting.com; en.tab-tv.com',
      method: 'Serial begins with 2 letters followed by 6 digits and optional suffix.',
      notes: '12-year repeating cycle. GE water heaters manufactured by Rheem — use Group 7A. Haier-era units (post-2016) continue using same format.',
      source: 'products.geappliances.com; cannonsappliance.com; lumayeconsulting.com; en.tab-tv.com',
      yearMap: { 'A': '1977/1989/2001/2013/2025', 'D': '1978/1990/2002/2014/2026', 'F': '1979/1991/2003/2015', 'G': '1980/1992/2004/2016', 'H': '1981/1993/2005/2017', 'L': '1982/1994/2006/2018', 'M': '1983/1995/2007/2019', 'R': '1984/1996/2008/2020', 'S': '1985/1997/2009/2021', 'T': '1986/1998/2010/2022', 'V': '1987/1999/2011/2023', 'Z': '1988/2000/2012/2024' },
      monthMap: { 'A': 'January', 'D': 'February', 'F': 'March', 'G': 'April', 'H': 'May', 'L': 'June', 'M': 'July', 'R': 'August', 'S': 'September', 'T': 'October', 'V': 'November', 'Z': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 2) return null;
      var monthChar = serial[0].toUpperCase();
      var yearChar = serial[1].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar };
    }
    },
    'ge_caf': {
      name: 'GE Café',
      parentManufacturer: 'GE Appliances (owned by Haier since 2016)',
      groupId: '2',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1977-Present',
      serialLengthNote: 'Serial begins with 2 letters followed by 6 digits and optional suffix.',
      decodeMethod: 'Character 2 (second letter)',
      yearCodePosition: 'Character 2 (second letter)',
      monthCodePosition: 'Character 1 (first letter)',
      outputType: 'Month + Year',
      decodeNotes: '12-year repeating cycle. GE water heaters manufactured by Rheem — use Group 7A. Haier-era units (post-2016) continue using same format.',
      exampleSerial: 'RG527327B',
      exampleResult: 'R=August G=1980/1992/2004/2016',
      sources: 'products.geappliances.com; cannonsappliance.com; lumayeconsulting.com; en.tab-tv.com',
      method: 'Serial begins with 2 letters followed by 6 digits and optional suffix.',
      notes: '12-year repeating cycle. GE water heaters manufactured by Rheem — use Group 7A. Haier-era units (post-2016) continue using same format.',
      source: 'products.geappliances.com; cannonsappliance.com; lumayeconsulting.com; en.tab-tv.com',
      yearMap: { 'A': '1977/1989/2001/2013/2025', 'D': '1978/1990/2002/2014/2026', 'F': '1979/1991/2003/2015', 'G': '1980/1992/2004/2016', 'H': '1981/1993/2005/2017', 'L': '1982/1994/2006/2018', 'M': '1983/1995/2007/2019', 'R': '1984/1996/2008/2020', 'S': '1985/1997/2009/2021', 'T': '1986/1998/2010/2022', 'V': '1987/1999/2011/2023', 'Z': '1988/2000/2012/2024' },
      monthMap: { 'A': 'January', 'D': 'February', 'F': 'March', 'G': 'April', 'H': 'May', 'L': 'June', 'M': 'July', 'R': 'August', 'S': 'September', 'T': 'October', 'V': 'November', 'Z': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 2) return null;
      var monthChar = serial[0].toUpperCase();
      var yearChar = serial[1].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar };
    }
    },
    'ge_monogram': {
      name: 'GE Monogram',
      parentManufacturer: 'GE Appliances (owned by Haier since 2016)',
      groupId: '2',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1977-Present',
      serialLengthNote: 'Serial begins with 2 letters followed by 6 digits and optional suffix.',
      decodeMethod: 'Character 2 (second letter)',
      yearCodePosition: 'Character 2 (second letter)',
      monthCodePosition: 'Character 1 (first letter)',
      outputType: 'Month + Year',
      decodeNotes: '12-year repeating cycle. GE water heaters manufactured by Rheem — use Group 7A. Haier-era units (post-2016) continue using same format.',
      exampleSerial: 'RG527327B',
      exampleResult: 'R=August G=1980/1992/2004/2016',
      sources: 'products.geappliances.com; cannonsappliance.com; lumayeconsulting.com; en.tab-tv.com',
      method: 'Serial begins with 2 letters followed by 6 digits and optional suffix.',
      notes: '12-year repeating cycle. GE water heaters manufactured by Rheem — use Group 7A. Haier-era units (post-2016) continue using same format.',
      source: 'products.geappliances.com; cannonsappliance.com; lumayeconsulting.com; en.tab-tv.com',
      yearMap: { 'A': '1977/1989/2001/2013/2025', 'D': '1978/1990/2002/2014/2026', 'F': '1979/1991/2003/2015', 'G': '1980/1992/2004/2016', 'H': '1981/1993/2005/2017', 'L': '1982/1994/2006/2018', 'M': '1983/1995/2007/2019', 'R': '1984/1996/2008/2020', 'S': '1985/1997/2009/2021', 'T': '1986/1998/2010/2022', 'V': '1987/1999/2011/2023', 'Z': '1988/2000/2012/2024' },
      monthMap: { 'A': 'January', 'D': 'February', 'F': 'March', 'G': 'April', 'H': 'May', 'L': 'June', 'M': 'July', 'R': 'August', 'S': 'September', 'T': 'October', 'V': 'November', 'Z': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 2) return null;
      var monthChar = serial[0].toUpperCase();
      var yearChar = serial[1].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar };
    }
    },
    'hotpoint': {
      name: 'Hotpoint',
      parentManufacturer: 'GE Appliances (owned by Haier since 2016)',
      groupId: '2',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1977-Present',
      serialLengthNote: 'Serial begins with 2 letters followed by 6 digits and optional suffix.',
      decodeMethod: 'Character 2 (second letter)',
      yearCodePosition: 'Character 2 (second letter)',
      monthCodePosition: 'Character 1 (first letter)',
      outputType: 'Month + Year',
      decodeNotes: '12-year repeating cycle. GE water heaters manufactured by Rheem — use Group 7A. Haier-era units (post-2016) continue using same format.',
      exampleSerial: 'RG527327B',
      exampleResult: 'R=August G=1980/1992/2004/2016',
      sources: 'products.geappliances.com; cannonsappliance.com; lumayeconsulting.com; en.tab-tv.com',
      method: 'Serial begins with 2 letters followed by 6 digits and optional suffix.',
      notes: '12-year repeating cycle. GE water heaters manufactured by Rheem — use Group 7A. Haier-era units (post-2016) continue using same format.',
      source: 'products.geappliances.com; cannonsappliance.com; lumayeconsulting.com; en.tab-tv.com',
      yearMap: { 'A': '1977/1989/2001/2013/2025', 'D': '1978/1990/2002/2014/2026', 'F': '1979/1991/2003/2015', 'G': '1980/1992/2004/2016', 'H': '1981/1993/2005/2017', 'L': '1982/1994/2006/2018', 'M': '1983/1995/2007/2019', 'R': '1984/1996/2008/2020', 'S': '1985/1997/2009/2021', 'T': '1986/1998/2010/2022', 'V': '1987/1999/2011/2023', 'Z': '1988/2000/2012/2024' },
      monthMap: { 'A': 'January', 'D': 'February', 'F': 'March', 'G': 'April', 'H': 'May', 'L': 'June', 'M': 'July', 'R': 'August', 'S': 'September', 'T': 'October', 'V': 'November', 'Z': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 2) return null;
      var monthChar = serial[0].toUpperCase();
      var yearChar = serial[1].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar };
    }
    },
    'rca': {
      name: 'RCA',
      parentManufacturer: 'GE Appliances (owned by Haier since 2016)',
      groupId: '2',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven; Microwave',
      serialEra: '1977-Present',
      serialLengthNote: 'Serial begins with 2 letters followed by 6 digits and optional suffix.',
      decodeMethod: 'Character 2 (second letter)',
      yearCodePosition: 'Character 2 (second letter)',
      monthCodePosition: 'Character 1 (first letter)',
      outputType: 'Month + Year',
      decodeNotes: '12-year repeating cycle. GE water heaters manufactured by Rheem — use Group 7A. Haier-era units (post-2016) continue using same format.',
      exampleSerial: 'RG527327B',
      exampleResult: 'R=August G=1980/1992/2004/2016',
      sources: 'products.geappliances.com; cannonsappliance.com; lumayeconsulting.com; en.tab-tv.com',
      method: 'Serial begins with 2 letters followed by 6 digits and optional suffix.',
      notes: '12-year repeating cycle. GE water heaters manufactured by Rheem — use Group 7A. Haier-era units (post-2016) continue using same format.',
      source: 'products.geappliances.com; cannonsappliance.com; lumayeconsulting.com; en.tab-tv.com',
      yearMap: { 'A': '1977/1989/2001/2013/2025', 'D': '1978/1990/2002/2014/2026', 'F': '1979/1991/2003/2015', 'G': '1980/1992/2004/2016', 'H': '1981/1993/2005/2017', 'L': '1982/1994/2006/2018', 'M': '1983/1995/2007/2019', 'R': '1984/1996/2008/2020', 'S': '1985/1997/2009/2021', 'T': '1986/1998/2010/2022', 'V': '1987/1999/2011/2023', 'Z': '1988/2000/2012/2024' },
      monthMap: { 'A': 'January', 'D': 'February', 'F': 'March', 'G': 'April', 'H': 'May', 'L': 'June', 'M': 'July', 'R': 'August', 'S': 'September', 'T': 'October', 'V': 'November', 'Z': 'December' },
      decode: function(serial) {
      if (!serial || serial.length < 2) return null;
      var monthChar = serial[0].toUpperCase();
      var yearChar = serial[1].toUpperCase();
      var y = this.yearMap[yearChar];
      var m = this.monthMap[monthChar];
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar };
    }
    },
    'frigidaire': {
      name: 'Frigidaire',
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
      return { year: y || 'Unknown code: ' + yearDigit, month: 'Week ' + week + ' (see notes for decade)' };
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
      return { year: y || 'Unknown code: ' + yearDigit, month: 'Week ' + week + ' (see notes for decade)' };
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
      return { year: y || 'Unknown code: ' + yearDigit, month: 'Week ' + week + ' (see notes for decade)' };
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
      return { year: y || 'Unknown code: ' + yearDigit, month: 'Week ' + week + ' (see notes for decade)' };
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
      return { year: y || 'Unknown code: ' + yearDigit, month: 'Week ' + week + ' (see notes for decade)' };
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
      return { year: y || 'Unknown code: ' + yearDigit, month: 'Week ' + week + ' (see notes for decade)' };
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
      return { year: y || 'Unknown code: ' + yearDigit, month: 'Week ' + week + ' (see notes for decade)' };
    }
    },
    'samsung': {
      name: 'Samsung',
      parentManufacturer: 'Samsung Electronics',
      groupId: '4A',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: '2001-Present',
      serialLengthNote: '15-char serial: year at char 8 month at char 9. 11-char serial: year at char 4 month at char 5.',
      decodeMethod: 'Char 8 (15-digit serial) or Char 4 (11-digit serial)',
      yearCodePosition: 'Char 8 (15-digit serial) or Char 4 (11-digit serial)',
      monthCodePosition: 'Char 9 (15-digit) or Char 5 (11-digit)',
      outputType: 'Month + Year',
      decodeNotes: '20-year repeating cycle for some codes (R T W X Y A). Identify serial length before decoding.',
      exampleSerial: '07R5CAZHB001234 (15-char)',
      exampleResult: 'Char 8=A=2006/2026 Char 9=Z -> invalid; use actual serial',
      sources: 'homespy.io; electrical-forensics.com; lumayeconsulting.com',
      method: '15-char serial: year at char 8 month at char 9. 11-char serial: year at char 4 month at char 5.',
      notes: '20-year repeating cycle for some codes (R T W X Y A). Identify serial length before decoding.',
      source: 'homespy.io; electrical-forensics.com; lumayeconsulting.com',
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
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar };
    }
    },
    'lg': {
      name: 'LG',
      parentManufacturer: 'LG Electronics',
      groupId: '4B',
      products: 'Refrigerator; Washer; Dryer; Dishwasher; Range; Oven',
      serialEra: '2000-Present',
      serialLengthNote: 'Serial: [Year digit][2-digit month][remaining alphanumeric]',
      decodeMethod: 'Character 1',
      yearCodePosition: 'Character 1',
      monthCodePosition: 'Characters 2-3',
      outputType: 'Month + Year',
      decodeNotes: 'Decade must be inferred. 10-year repeating cycle. Example: 810XXXX = October 2008 or 2018.',
      exampleSerial: '810tagh22222',
      exampleResult: '8=2008/2018 10=October -> October 2008 or 2018',
      sources: 'homespy.io; lumayeconsulting.com; cannonsappliance.com',
      method: 'Serial: [Year digit][2-digit month][remaining alphanumeric]',
      notes: 'Decade must be inferred. 10-year repeating cycle. Example: 810XXXX = October 2008 or 2018.',
      source: 'homespy.io; lumayeconsulting.com; cannonsappliance.com',
      yearMap: { '0': '2000/2010/2020', '1': '2001/2011/2021', '2': '2002/2012/2022', '3': '2003/2013/2023', '4': '2004/2014/2024', '5': '2005/2015/2025', '6': '2006/2016', '7': '2007/2017', '8': '2008/2018', '9': '2009/2019' },
      monthMap: { '10': 'October', '11': 'November', '12': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 3) return null;
      var yearDigit = serial[0];
      var monthCode = serial.substring(1, 3).toUpperCase();
      var y = this.yearMap[yearDigit];
      var m = this.monthMap[monthCode];
      return { year: y || 'Unknown code: ' + yearDigit, month: m || 'Unknown code: ' + monthCode };
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
      return { year: y || fdYear, month: m || 'Unknown code: ' + fdMonth };
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
      return { year: y || fdYear, month: m || 'Unknown code: ' + fdMonth };
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
      return { year: y || fdYear, month: m || 'Unknown code: ' + fdMonth };
    }
    },
    'kenmore': {
      name: 'Kenmore',
      parentManufacturer: 'Sears/Various',
      groupId: '6',
      products: 'All major appliances',
      serialEra: 'All eras',
      serialLengthNote: 'Use first 3 digits of the MODEL number (before decimal point) to identify manufacturer.',
      decodeMethod: 'See Group 1A for Whirlpool',
      yearCodePosition: 'See Group 1A for Whirlpool',
      monthCodePosition: 'See Group 1A',
      outputType: 'Varies by manufacturer',
      decodeNotes: 'Kenmore model prefix 106 = Whirlpool. Serial number coding is IDENTICAL to that manufacturer. Use Group 1A decode logic.',
      exampleSerial: '110.XXXXXX',
      exampleResult: 'Prefix 110 = Whirlpool -> use Group 1A',
      sources: 'electrical-forensics.com; applianceserviceinfo.com; homespy.io; builderbuddy.com',
      method: 'Use first 3 digits of the MODEL number (before decimal point) to identify manufacturer.',
      notes: 'Kenmore model prefix 106 = Whirlpool. Serial number coding is IDENTICAL to that manufacturer. Use Group 1A decode logic.',
      source: 'electrical-forensics.com; applianceserviceinfo.com; homespy.io; builderbuddy.com',
      yearMap: { '103': 'Sears / Kenmore (not a manufacturer)', '106': 'Sears / Kenmore (not a manufacturer)', '110': 'Sears / Kenmore (not a manufacturer)', '119': 'Sears / Kenmore (not a manufacturer)', '155': 'Sears / Kenmore (not a manufacturer)', '174': 'Sears / Kenmore (not a manufacturer)', '198': 'Sears / Kenmore (not a manufacturer)', '233': 'Sears / Kenmore (not a manufacturer)', '253': 'Sears / Kenmore (not a manufacturer)', '274': 'Sears / Kenmore (not a manufacturer)', '278': 'Sears / Kenmore (not a manufacturer)', '335': 'Sears / Kenmore (not a manufacturer)', '362': 'Sears / Kenmore (not a manufacturer)', '363': 'Sears / Kenmore (not a manufacturer)', '401': 'Sears / Kenmore (not a manufacturer)', '417': 'Sears / Kenmore (not a manufacturer)', '464': 'Sears / Kenmore (not a manufacturer)', '562': 'Sears / Kenmore (not a manufacturer)', '580': 'Sears / Kenmore (not a manufacturer)', '596': 'Sears / Kenmore (not a manufacturer)', '628': 'Sears / Kenmore (not a manufacturer)', '629': 'Sears / Kenmore (not a manufacturer)', '647': 'Sears / Kenmore (not a manufacturer)', '651': 'Sears / Kenmore (not a manufacturer)', '662': 'Sears / Kenmore (not a manufacturer)', '665': 'Sears / Kenmore (not a manufacturer)', '721': 'Sears / Kenmore (not a manufacturer)', '747': 'Sears / Kenmore (not a manufacturer)', '790': 'Sears / Kenmore (not a manufacturer)', '791': 'Sears / Kenmore (not a manufacturer)', '795': 'Sears / Kenmore (not a manufacturer)', '796': 'Sears / Kenmore (not a manufacturer)', '835': 'Sears / Kenmore (not a manufacturer)', '911': 'Sears / Kenmore (not a manufacturer)', '917': 'Sears / Kenmore (not a manufacturer)', '925': 'Sears / Kenmore (not a manufacturer)', '960': 'Sears / Kenmore (not a manufacturer)', '970': 'Sears / Kenmore (not a manufacturer)', '978': 'Sears / Kenmore (not a manufacturer)' },
      monthMap: {  },
      decode: function(serial) {
      var lines = Object.keys(this.yearMap).map(function(k) { return k + ' = ' + this.yearMap[k]; }.bind(this)).join('\n');
      return { year: 'See instructions below', month: 'Use first 3 digits of MODEL number to identify the manufacturer, then apply that manufacturer\'s serial number decode logic.\n\nKenmore Prefix Guide:\n' + lines };
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
      return { year: fullYear, month: m || 'Month ' + monthStr };
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
      return { year: fullYear, month: m || 'Month ' + monthStr };
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
      return { year: fullYear, month: m || 'Month ' + monthStr };
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
      return { year: fullYear, month: m || 'Month ' + monthStr };
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
      return { year: fullYear, month: m || 'Month ' + monthStr };
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
      return { year: fullYear, month: m || 'Month ' + monthStr };
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
      return { year: fullYear, month: m || 'Month ' + monthStr };
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
      return { year: fullYear, month: m || 'Month ' + monthStr };
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
      return { year: fullYear, month: m || 'Month ' + monthStr };
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
      return { year: fullYear, month: m || 'Month ' + monthStr };
    }
    },
    'a_o_smith': {
      name: 'A.O. Smith',
      parentManufacturer: 'A.O. Smith Corporation',
      groupId: '7B',
      products: 'Water Heater (tank)',
      serialEra: 'Pre-2008',
      serialLengthNote: 'Pre-2008: [Factory letter][Month letter][2-digit year][XXXXXX]. Post-2008: [YYYY][MM][XXXXXXX].',
      decodeMethod: 'Characters 3-4 (pre-2008 era)',
      yearCodePosition: 'Characters 3-4 (pre-2008 era)',
      monthCodePosition: 'Character 2 (pre-2008 era)',
      outputType: 'Month + Year',
      decodeNotes: 'I is skipped in month codes. Post-2008 format: first 4 digits = full year (e.g. 2018); next 2 digits = month (01-12). American Water Heater pre-2008: first 2 digits = year next 2 = week. AO Smith acquired State Industries and American Water Heater in 2001.',
      exampleSerial: 'BG9908XXXXX (pre-2008)',
      exampleResult: 'G=July 99=1999 -> July 1999',
      sources: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      method: 'Pre-2008: [Factory letter][Month letter][2-digit year][XXXXXX]. Post-2008: [YYYY][MM][XXXXXXX].',
      notes: 'I is skipped in month codes. Post-2008 format: first 4 digits = full year (e.g. 2018); next 2 digits = month (01-12). American Water Heater pre-2008: first 2 digits = year next 2 = week. AO Smith acquired State Industries and American Water Heater in 2001.',
      source: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      yearMap: { 'YY (e.g. 06 = 2006)': 'Prefix with 19XX or 20XX based on context', 'YYYY (e.g. 2018)': 'Read directly (e.g. 2018)' },
      monthMap: { '10': 'October', '11': 'November', '12': 'December', 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'J': 'September', 'K': 'October', 'L': 'November', 'M': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      if (/^\d{4}/.test(serial) && serial.length >= 6) {
        var year = serial.substring(0, 4);
        var month = serial.substring(4, 6);
        var m = this.monthMap[month];
        return { year: year, month: m || 'Month ' + month };
      } else {
        var monthChar = serial[1].toUpperCase();
        var yearDigits = serial.substring(2, 4);
        var fullYear = parseInt(yearDigits) >= 84 ? '19' + yearDigits : '20' + yearDigits;
        var m2 = this.monthMap[monthChar];
        return { year: fullYear, month: m2 || 'Unknown code: ' + monthChar };
      }
    }
    },
    'state_industries': {
      name: 'State Industries',
      parentManufacturer: 'A.O. Smith Corporation',
      groupId: '7B',
      products: 'Water Heater (tank)',
      serialEra: 'Pre-2008',
      serialLengthNote: 'Pre-2008: [Factory letter][Month letter][2-digit year][XXXXXX]. Post-2008: [YYYY][MM][XXXXXXX].',
      decodeMethod: 'Characters 3-4 (pre-2008 era)',
      yearCodePosition: 'Characters 3-4 (pre-2008 era)',
      monthCodePosition: 'Character 2 (pre-2008 era)',
      outputType: 'Month + Year',
      decodeNotes: 'I is skipped in month codes. Post-2008 format: first 4 digits = full year (e.g. 2018); next 2 digits = month (01-12). American Water Heater pre-2008: first 2 digits = year next 2 = week. AO Smith acquired State Industries and American Water Heater in 2001.',
      exampleSerial: 'BG9908XXXXX (pre-2008)',
      exampleResult: 'G=July 99=1999 -> July 1999',
      sources: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      method: 'Pre-2008: [Factory letter][Month letter][2-digit year][XXXXXX]. Post-2008: [YYYY][MM][XXXXXXX].',
      notes: 'I is skipped in month codes. Post-2008 format: first 4 digits = full year (e.g. 2018); next 2 digits = month (01-12). American Water Heater pre-2008: first 2 digits = year next 2 = week. AO Smith acquired State Industries and American Water Heater in 2001.',
      source: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      yearMap: { 'YY (e.g. 06 = 2006)': 'Prefix with 19XX or 20XX based on context', 'YYYY (e.g. 2018)': 'Read directly (e.g. 2018)' },
      monthMap: { '10': 'October', '11': 'November', '12': 'December', 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'J': 'September', 'K': 'October', 'L': 'November', 'M': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      if (/^\d{4}/.test(serial) && serial.length >= 6) {
        var year = serial.substring(0, 4);
        var month = serial.substring(4, 6);
        var m = this.monthMap[month];
        return { year: year, month: m || 'Month ' + month };
      } else {
        var monthChar = serial[1].toUpperCase();
        var yearDigits = serial.substring(2, 4);
        var fullYear = parseInt(yearDigits) >= 84 ? '19' + yearDigits : '20' + yearDigits;
        var m2 = this.monthMap[monthChar];
        return { year: fullYear, month: m2 || 'Unknown code: ' + monthChar };
      }
    }
    },
    'reliance_water_heaters': {
      name: 'Reliance Water Heaters',
      parentManufacturer: 'A.O. Smith Corporation',
      groupId: '7B',
      products: 'Water Heater (tank)',
      serialEra: 'Pre-2008',
      serialLengthNote: 'Pre-2008: [Factory letter][Month letter][2-digit year][XXXXXX]. Post-2008: [YYYY][MM][XXXXXXX].',
      decodeMethod: 'Characters 3-4 (pre-2008 era)',
      yearCodePosition: 'Characters 3-4 (pre-2008 era)',
      monthCodePosition: 'Character 2 (pre-2008 era)',
      outputType: 'Month + Year',
      decodeNotes: 'I is skipped in month codes. Post-2008 format: first 4 digits = full year (e.g. 2018); next 2 digits = month (01-12). American Water Heater pre-2008: first 2 digits = year next 2 = week. AO Smith acquired State Industries and American Water Heater in 2001.',
      exampleSerial: 'BG9908XXXXX (pre-2008)',
      exampleResult: 'G=July 99=1999 -> July 1999',
      sources: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      method: 'Pre-2008: [Factory letter][Month letter][2-digit year][XXXXXX]. Post-2008: [YYYY][MM][XXXXXXX].',
      notes: 'I is skipped in month codes. Post-2008 format: first 4 digits = full year (e.g. 2018); next 2 digits = month (01-12). American Water Heater pre-2008: first 2 digits = year next 2 = week. AO Smith acquired State Industries and American Water Heater in 2001.',
      source: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      yearMap: { 'YY (e.g. 06 = 2006)': 'Prefix with 19XX or 20XX based on context', 'YYYY (e.g. 2018)': 'Read directly (e.g. 2018)' },
      monthMap: { '10': 'October', '11': 'November', '12': 'December', 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'J': 'September', 'K': 'October', 'L': 'November', 'M': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      if (/^\d{4}/.test(serial) && serial.length >= 6) {
        var year = serial.substring(0, 4);
        var month = serial.substring(4, 6);
        var m = this.monthMap[month];
        return { year: year, month: m || 'Month ' + month };
      } else {
        var monthChar = serial[1].toUpperCase();
        var yearDigits = serial.substring(2, 4);
        var fullYear = parseInt(yearDigits) >= 84 ? '19' + yearDigits : '20' + yearDigits;
        var m2 = this.monthMap[monthChar];
        return { year: fullYear, month: m2 || 'Unknown code: ' + monthChar };
      }
    }
    },
    'american_water_heater_company': {
      name: 'American Water Heater Company',
      parentManufacturer: 'A.O. Smith Corporation',
      groupId: '7B',
      products: 'Water Heater (tank)',
      serialEra: 'Pre-2008',
      serialLengthNote: 'Pre-2008: [Factory letter][Month letter][2-digit year][XXXXXX]. Post-2008: [YYYY][MM][XXXXXXX].',
      decodeMethod: 'Characters 3-4 (pre-2008 era)',
      yearCodePosition: 'Characters 3-4 (pre-2008 era)',
      monthCodePosition: 'Character 2 (pre-2008 era)',
      outputType: 'Month + Year',
      decodeNotes: 'I is skipped in month codes. Post-2008 format: first 4 digits = full year (e.g. 2018); next 2 digits = month (01-12). American Water Heater pre-2008: first 2 digits = year next 2 = week. AO Smith acquired State Industries and American Water Heater in 2001.',
      exampleSerial: 'BG9908XXXXX (pre-2008)',
      exampleResult: 'G=July 99=1999 -> July 1999',
      sources: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      method: 'Pre-2008: [Factory letter][Month letter][2-digit year][XXXXXX]. Post-2008: [YYYY][MM][XXXXXXX].',
      notes: 'I is skipped in month codes. Post-2008 format: first 4 digits = full year (e.g. 2018); next 2 digits = month (01-12). American Water Heater pre-2008: first 2 digits = year next 2 = week. AO Smith acquired State Industries and American Water Heater in 2001.',
      source: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      yearMap: { 'YY (e.g. 06 = 2006)': 'Prefix with 19XX or 20XX based on context', 'YYYY (e.g. 2018)': 'Read directly (e.g. 2018)' },
      monthMap: { '10': 'October', '11': 'November', '12': 'December', 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'J': 'September', 'K': 'October', 'L': 'November', 'M': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      if (/^\d{4}/.test(serial) && serial.length >= 6) {
        var year = serial.substring(0, 4);
        var month = serial.substring(4, 6);
        var m = this.monthMap[month];
        return { year: year, month: m || 'Month ' + month };
      } else {
        var monthChar = serial[1].toUpperCase();
        var yearDigits = serial.substring(2, 4);
        var fullYear = parseInt(yearDigits) >= 84 ? '19' + yearDigits : '20' + yearDigits;
        var m2 = this.monthMap[monthChar];
        return { year: fullYear, month: m2 || 'Unknown code: ' + monthChar };
      }
    }
    },
    'u_s_craftmaster': {
      name: 'U.S. Craftmaster',
      parentManufacturer: 'A.O. Smith Corporation',
      groupId: '7B',
      products: 'Water Heater (tank)',
      serialEra: 'Pre-2008',
      serialLengthNote: 'Pre-2008: [Factory letter][Month letter][2-digit year][XXXXXX]. Post-2008: [YYYY][MM][XXXXXXX].',
      decodeMethod: 'Characters 3-4 (pre-2008 era)',
      yearCodePosition: 'Characters 3-4 (pre-2008 era)',
      monthCodePosition: 'Character 2 (pre-2008 era)',
      outputType: 'Month + Year',
      decodeNotes: 'I is skipped in month codes. Post-2008 format: first 4 digits = full year (e.g. 2018); next 2 digits = month (01-12). American Water Heater pre-2008: first 2 digits = year next 2 = week. AO Smith acquired State Industries and American Water Heater in 2001.',
      exampleSerial: 'BG9908XXXXX (pre-2008)',
      exampleResult: 'G=July 99=1999 -> July 1999',
      sources: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      method: 'Pre-2008: [Factory letter][Month letter][2-digit year][XXXXXX]. Post-2008: [YYYY][MM][XXXXXXX].',
      notes: 'I is skipped in month codes. Post-2008 format: first 4 digits = full year (e.g. 2018); next 2 digits = month (01-12). American Water Heater pre-2008: first 2 digits = year next 2 = week. AO Smith acquired State Industries and American Water Heater in 2001.',
      source: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      yearMap: { 'YY (e.g. 06 = 2006)': 'Prefix with 19XX or 20XX based on context', 'YYYY (e.g. 2018)': 'Read directly (e.g. 2018)' },
      monthMap: { '10': 'October', '11': 'November', '12': 'December', 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'J': 'September', 'K': 'October', 'L': 'November', 'M': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      if (/^\d{4}/.test(serial) && serial.length >= 6) {
        var year = serial.substring(0, 4);
        var month = serial.substring(4, 6);
        var m = this.monthMap[month];
        return { year: year, month: m || 'Month ' + month };
      } else {
        var monthChar = serial[1].toUpperCase();
        var yearDigits = serial.substring(2, 4);
        var fullYear = parseInt(yearDigits) >= 84 ? '19' + yearDigits : '20' + yearDigits;
        var m2 = this.monthMap[monthChar];
        return { year: fullYear, month: m2 || 'Unknown code: ' + monthChar };
      }
    }
    },
    'gsw': {
      name: 'GSW',
      parentManufacturer: 'A.O. Smith Corporation',
      groupId: '7B',
      products: 'Water Heater (tank)',
      serialEra: 'Pre-2008',
      serialLengthNote: 'Pre-2008: [Factory letter][Month letter][2-digit year][XXXXXX]. Post-2008: [YYYY][MM][XXXXXXX].',
      decodeMethod: 'Characters 3-4 (pre-2008 era)',
      yearCodePosition: 'Characters 3-4 (pre-2008 era)',
      monthCodePosition: 'Character 2 (pre-2008 era)',
      outputType: 'Month + Year',
      decodeNotes: 'I is skipped in month codes. Post-2008 format: first 4 digits = full year (e.g. 2018); next 2 digits = month (01-12). American Water Heater pre-2008: first 2 digits = year next 2 = week. AO Smith acquired State Industries and American Water Heater in 2001.',
      exampleSerial: 'BG9908XXXXX (pre-2008)',
      exampleResult: 'G=July 99=1999 -> July 1999',
      sources: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      method: 'Pre-2008: [Factory letter][Month letter][2-digit year][XXXXXX]. Post-2008: [YYYY][MM][XXXXXXX].',
      notes: 'I is skipped in month codes. Post-2008 format: first 4 digits = full year (e.g. 2018); next 2 digits = month (01-12). American Water Heater pre-2008: first 2 digits = year next 2 = week. AO Smith acquired State Industries and American Water Heater in 2001.',
      source: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      yearMap: { 'YY (e.g. 06 = 2006)': 'Prefix with 19XX or 20XX based on context', 'YYYY (e.g. 2018)': 'Read directly (e.g. 2018)' },
      monthMap: { '10': 'October', '11': 'November', '12': 'December', 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'J': 'September', 'K': 'October', 'L': 'November', 'M': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      if (/^\d{4}/.test(serial) && serial.length >= 6) {
        var year = serial.substring(0, 4);
        var month = serial.substring(4, 6);
        var m = this.monthMap[month];
        return { year: year, month: m || 'Month ' + month };
      } else {
        var monthChar = serial[1].toUpperCase();
        var yearDigits = serial.substring(2, 4);
        var fullYear = parseInt(yearDigits) >= 84 ? '19' + yearDigits : '20' + yearDigits;
        var m2 = this.monthMap[monthChar];
        return { year: fullYear, month: m2 || 'Unknown code: ' + monthChar };
      }
    }
    },
    'whirlpool_water_heaters': {
      name: 'Whirlpool Water Heaters',
      parentManufacturer: 'A.O. Smith Corporation',
      groupId: '7B',
      products: 'Water Heater (tank)',
      serialEra: 'Pre-2008',
      serialLengthNote: 'Pre-2008: [Factory letter][Month letter][2-digit year][XXXXXX]. Post-2008: [YYYY][MM][XXXXXXX].',
      decodeMethod: 'Characters 3-4 (pre-2008 era)',
      yearCodePosition: 'Characters 3-4 (pre-2008 era)',
      monthCodePosition: 'Character 2 (pre-2008 era)',
      outputType: 'Month + Year',
      decodeNotes: 'I is skipped in month codes. Post-2008 format: first 4 digits = full year (e.g. 2018); next 2 digits = month (01-12). American Water Heater pre-2008: first 2 digits = year next 2 = week. AO Smith acquired State Industries and American Water Heater in 2001.',
      exampleSerial: 'BG9908XXXXX (pre-2008)',
      exampleResult: 'G=July 99=1999 -> July 1999',
      sources: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      method: 'Pre-2008: [Factory letter][Month letter][2-digit year][XXXXXX]. Post-2008: [YYYY][MM][XXXXXXX].',
      notes: 'I is skipped in month codes. Post-2008 format: first 4 digits = full year (e.g. 2018); next 2 digits = month (01-12). American Water Heater pre-2008: first 2 digits = year next 2 = week. AO Smith acquired State Industries and American Water Heater in 2001.',
      source: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      yearMap: { 'YY (e.g. 06 = 2006)': 'Prefix with 19XX or 20XX based on context', 'YYYY (e.g. 2018)': 'Read directly (e.g. 2018)' },
      monthMap: { '10': 'October', '11': 'November', '12': 'December', 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'J': 'September', 'K': 'October', 'L': 'November', 'M': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      if (/^\d{4}/.test(serial) && serial.length >= 6) {
        var year = serial.substring(0, 4);
        var month = serial.substring(4, 6);
        var m = this.monthMap[month];
        return { year: year, month: m || 'Month ' + month };
      } else {
        var monthChar = serial[1].toUpperCase();
        var yearDigits = serial.substring(2, 4);
        var fullYear = parseInt(yearDigits) >= 84 ? '19' + yearDigits : '20' + yearDigits;
        var m2 = this.monthMap[monthChar];
        return { year: fullYear, month: m2 || 'Unknown code: ' + monthChar };
      }
    }
    },
    'bradford_white': {
      name: 'Bradford White',
      parentManufacturer: 'Bradford White Corporation (independent)',
      groupId: '7C',
      products: 'Water Heater (tank)',
      serialEra: '1984-Present',
      serialLengthNote: '9 or 10-character serial. Format: [Year letter][Month letter][7 or 8-digit sequence].',
      decodeMethod: 'Character 1',
      yearCodePosition: 'Character 1',
      monthCodePosition: 'Character 2',
      outputType: 'Month + Year',
      decodeNotes: '20-year repeating cycle. Letters I O Q R U V never used EXCEPT: a computer error produced \'O\' prefix units in January 1997 only. Resolve ambiguity using ANSI compliance date on rating plate (revised every 6-8 years). Bradford White is independently owned and does not sell under other brand names.',
      exampleSerial: 'HG4829551',
      exampleResult: 'H=1991 or 2011 + G=July -> July 1991 or 2011',
      sources: 'forthepro.bradfordwhite.com; hotwatersolutionsnw.org; building-center.org; waterheaterhub.com',
      method: '9 or 10-character serial. Format: [Year letter][Month letter][7 or 8-digit sequence].',
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
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar };
    }
    }
    }
  },
  electronics: {
    brands: [
      { id: 'samsung_tv', name: 'Samsung' },
      { id: 'lg_tv', name: 'LG' },
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
      notes: 'Samsung TVs and monitors use the same serial format as Samsung appliances. Serial label is on the back of the device. Some codes have a 20-year cycle — verify decade using model generation or condition.',
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
      return { year: y || 'Unknown code: ' + yearChar, month: m || 'Unknown code: ' + monthChar };
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
      return { year: y || 'Unknown code: ' + yearDigit, month: m || 'Unknown code: ' + monthCode };
    }
    }
    }
  }
};
