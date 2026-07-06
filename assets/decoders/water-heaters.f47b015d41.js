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
      decode: function(serial, modelHint) {
      if (!serial || serial.length < 4) return null;
      var s = String(serial).toUpperCase().replace(/\s+/g, '');
      var normalizedModel = String(modelHint || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

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

      function decodeWeekYearDigits(ww, yy, styleLabel) {
        var week = parseInt(ww, 10);
        if (!(week >= 1 && week <= 53)) return null;
        var fullYearPrefix = resolveTwoDigitYear(yy);
        if (!fullYearPrefix) return null;
        return {
          year: String(fullYearPrefix),
          month: 'Week ' + ww,
          yearCode: yy,
          weekDigits: ww,
          decodeStyle: styleLabel
        };
      }

      function decodeRhPrefixed(match, weekIdx, yearIdx) {
        if (!match) return null;
        return decodeWeekYearDigits(match[weekIdx], match[yearIdx], 'RH-prefixed WWYY');
      }

      // Try RH + WWYY first, then RHx + WWYY (x = optional plant/line code).
      var rhNoExtra = decodeRhPrefixed(s.match(/^RH(\d{2})(\d{2})([A-Z0-9].*)?$/), 1, 2);
      if (rhNoExtra) return rhNoExtra;
      var rhWithExtra = decodeRhPrefixed(s.match(/^RH([A-Z0-9])(\d{2})(\d{2})([A-Z0-9].*)?$/), 2, 3);
      if (rhWithExtra) return rhWithExtra;

      var style2 = decodeWeekYearDigits(s.substring(1, 3), s.substring(3, 5), 'Style 2');
      var style3 = decodeWeekYearDigits(s.substring(2, 4), s.substring(4, 6), 'Style 3');
      var embeddedWeekYear = null;
      var embeddedMatch = s.match(/[A-Z](\d{2})(\d{2})/);
      if (embeddedMatch) embeddedWeekYear = decodeWeekYearDigits(embeddedMatch[1], embeddedMatch[2], 'Embedded WWYY');

      var style1 = null;
      if (/^\d{4}/.test(s)) {
        var monthStr = s.substring(0, 2);
        var yearDigits = s.substring(2, 4);
        var fullYear = parseInt(yearDigits, 10) >= 84 ? '19' + yearDigits : '20' + yearDigits;
        var m = this.monthMap[monthStr];
        style1 = { year: fullYear, month: m || 'Month ' + monthStr, yearCode: yearDigits, monthCode: monthStr, decodeStyle: 'Style 1' };
      }

      // Some later all-numeric Rheem tank labels fit the documented week/year layouts
      // better than the legacy MMYY pattern. Prefer Style 2 when it points to a clearly
      // modern year and the MMYY interpretation lands far earlier, especially on RH9x models.
      if (style1 && style2) {
        var style1Year = parseInt(style1.year, 10);
        var style2Year = parseInt(style2.year, 10);
        var modelSuggestsModernRh = /RH9\d/.test(normalizedModel);
        if (modelSuggestsModernRh && style2Year >= 2015) return style2;
        if (/^\d{10}$/.test(s) && style1Year <= 2010 && style2Year >= 2015) return style2;
      }

      if (style1 && style1.month.indexOf('Month ') === 0) {
        if (style2) return style2;
        if (style3) return style3;
      }

      if (style1) return style1;
      if (embeddedWeekYear) return embeddedWeekYear;
      if (style2) return style2;
      if (style3) return style3;
      return null;
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
      if (!serial || serial.length < 3) return null;
      var YEAR_NOW = new Date().getFullYear();
      // Pre-2008 format: starts with a letter â€” [Factory][Month code][2-digit year][...]
      // A.O. Smith format: [Month code][2-digit year][sequence] -- NO factory prefix
      if (/^[A-Za-z]/.test(serial)) {
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
      var numericYYWW = decodeAOSmithFamilyNumericYYWW(serial);
      if (numericYYWW) return numericYYWW;
      return null;
    }
    },
    'state_industries': {
      name: 'State Industries',
      parentManufacturer: 'A.O. Smith Corporation',
      groupId: '7B',
      products: 'Water Heater (tank)',
      serialEra: 'Pre-2008',
      serialLengthNote: 'Pre-2008 format: [Factory letter][Month code][2-digit year][...]. Some legacy examples may omit the factory letter and begin with the month code directly. Numeric format: [YY][WW][...] where YY = 2-digit year and WW = production week (01\u201353).',
      decodeMethod: 'Character 2 (month code), characters 3-4 (year) for standard pre-2008 letter-coded serials',
      yearCodePosition: 'Characters 3-4 (standard pre-2008 letter-coded serials)',
      monthCodePosition: 'Character 2 (standard pre-2008 letter-coded serials)',
      outputType: 'Month + Year',
      decodeNotes: 'Pre-2008 Reliance serials generally follow the A.O. Smith family pattern: [Factory letter][Month code][2-digit year][...], with I skipped in the month codes. Numeric serials can still use YYWW.',
      exampleSerial: 'BA14056189 (pre-2008 letter-coded) or 1504A023527 (numeric YYWW)',
      exampleResult: 'B=factory, A=January, 14=2014 \u2192 January 2014 | 15=2015, 04=week 4 \u2192 2015 week 4',
      sources: 'fastwaterheater.com; plumbingways.com; kcwaterheater.com; builderbuddy.com',
      method: 'Pre-2008 format: [Factory letter][Month code][2-digit year][...], with a fallback for legacy examples that begin directly with the month code. Numeric format can use YYWW.',
      notes: 'Pre-2008 Reliance serials generally use the A.O. Smith family month code map with the month in character 2 and the year in characters 3-4. I is skipped.',
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
      var numericYYWW = decodeAOSmithFamilyNumericYYWW(serial);
      if (numericYYWW) return numericYYWW;
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
      monthMap: { '10': 'October', '11': 'November', '12': 'December', 'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April', 'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August', 'J': 'September', 'K': 'October', 'L': 'November', 'M': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September' },
      decode: function(serial) {
      if (!serial || serial.length < 4) return null;
      var YEAR_NOW = new Date().getFullYear();
      // Standard pre-2008 format: [Factory][Month][YY][...]
      if (/^[A-Za-z]{2}\d{2}/.test(serial)) {
        var monthChar = serial[1].toUpperCase();
        var yearDigits = serial.substring(2, 4);
        var yr = parseInt(yearDigits);
        var fullYear = yr >= 84 ? '19' + yearDigits : '20' + yearDigits;
        var m2 = this.monthMap[monthChar];
        return { year: fullYear, month: m2 || 'Unknown code: ' + monthChar, yearCode: yearDigits, monthCode: monthChar };
      }
      // Legacy fallback: [Month][YY][...]
      if (/^[A-Za-z]\d{2}/.test(serial)) {
        var legacyMonthChar = serial[0].toUpperCase();
        var legacyYearDigits = serial.substring(1, 3);
        var legacyYr = parseInt(legacyYearDigits);
        var legacyFullYear = legacyYr >= 84 ? '19' + legacyYearDigits : '20' + legacyYearDigits;
        var legacyMonth = this.monthMap[legacyMonthChar];
        return { year: legacyFullYear, month: legacyMonth || 'Unknown code: ' + legacyMonthChar, yearCode: legacyYearDigits, monthCode: legacyMonthChar };
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
      var numericYYWW = decodeAOSmithFamilyNumericYYWW(serial);
      if (numericYYWW) return numericYYWW;
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
      var numericYYWW = decodeAOSmithFamilyNumericYYWW(serial);
      if (numericYYWW) return numericYYWW;
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
      var numericYYWW = decodeAOSmithFamilyNumericYYWW(serial);
      if (numericYYWW) return numericYYWW;
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
      var numericYYWW = decodeAOSmithFamilyNumericYYWW(serial);
      if (numericYYWW) return numericYYWW;
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
      var numericYYWW = decodeAOSmithFamilyNumericYYWW(serial);
      if (numericYYWW) return numericYYWW;
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
  };
  global.decoderData = global.decoderData || {};
  global.decoderData.waterHeaters = categoryData;
})(window);
