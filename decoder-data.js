// Serial Number Decoder Database
const decoderData = {
    appliances: {
        brands: [
            { id: 'ge', name: 'GE' },
            { id: 'whirlpool', name: 'Whirlpool' },
            { id: 'maytag', name: 'Maytag' },
            { id: 'frigidaire', name: 'Frigidaire' },
            { id: 'lg', name: 'LG' },
            { id: 'samsung', name: 'Samsung' },
            { id: 'kitchenaid', name: 'KitchenAid' },
            { id: 'amana', name: 'Amana' },
            { id: 'bosch', name: 'Bosch' },
            { id: 'thermador', name: 'Thermador' },
            { id: 'speedqueen', name: 'Speed Queen' },
            { id: 'rheem', name: 'Rheem (Water Heater)' },
            { id: 'bradford', name: 'Bradford White (Water Heater)' },
            { id: 'aosmith', name: 'AO Smith (Water Heater)' },
            { id: 'ruud', name: 'Ruud (Water Heater)' }
        ],
        
        decoders: {
            ge: {
                name: 'GE',
                products: 'Refrigerator, Freezer, Range, Oven, Dishwasher, Microwave, Dryer, Washer',
                method: 'First 2 letters of serial number: 1st letter = month, 2nd letter = year',
                notes: 'Letters repeat every 12 years. Use appliance style/features to determine decade.',
                source: 'GE Official, homespy.io, cannonsappliance.com',
                decode: function(serial) {
                    if (!serial || serial.length < 2) return null;
                    
                    const monthCodes = {
                        'A': 'January', 'D': 'February', 'F': 'March', 'G': 'April',
                        'H': 'May', 'L': 'June', 'M': 'July', 'R': 'August',
                        'S': 'September', 'T': 'October', 'V': 'November', 'Z': 'December'
                    };
                    
                    const yearCodes = {
                        'A': '2001/2013/2025', 'D': '2002/2014/2026', 'F': '2003/2015',
                        'G': '2004/2016', 'H': '2005/2017', 'L': '2006/2018',
                        'M': '2007/2019', 'R': '2008/2020', 'S': '2009/2021',
                        'T': '2010/2022', 'V': '2011/2023', 'Z': '2012/2024'
                    };
                    
                    const month = monthCodes[serial[0].toUpperCase()];
                    const year = yearCodes[serial[1].toUpperCase()];
                    
                    return {
                        year: year || 'Invalid year code',
                        month: month || 'Invalid month code'
                    };
                }
            },
            
            whirlpool: {
                name: 'Whirlpool',
                products: 'Refrigerator, Freezer, Range, Oven, Dishwasher, Microwave, Dryer, Washer',
                method: '2nd character (9-digit serial) or 3rd character (10-digit serial) = year; Following 2 digits = week',
                notes: 'Letters repeat every 12 years. Determine serial length first.',
                source: 'electrical-forensics.com, homespy.io',
                decode: function(serial) {
                    if (!serial || serial.length < 4) return null;
                    
                    const yearCodes = {
                        'A': '1991/2003/2015', 'B': '1992/2004/2016', 'C': '1993/2005/2017',
                        'D': '1994/2006/2018', 'E': '1995/2007/2019', 'F': '1996/2008/2020',
                        'G': '1997/2009/2021', 'H': '1998/2010/2022', 'J': '1999/2011/2023',
                        'K': '2000/2012/2024', 'L': '2001/2013/2025', 'M': '2002/2014/2026'
                    };
                    
                    let yearPos, weekPos;
                    if (serial.length === 9) {
                        yearPos = 1;
                        weekPos = 2;
                    } else if (serial.length === 10) {
                        yearPos = 2;
                        weekPos = 3;
                    } else {
                        yearPos = 1;
                        weekPos = 2;
                    }
                    
                    const year = yearCodes[serial[yearPos].toUpperCase()];
                    const week = serial.substring(weekPos, weekPos + 2);
                    
                    return {
                        year: year || 'Invalid year code',
                        month: `Week ${week}`
                    };
                }
            },
            
            maytag: {
                name: 'Maytag',
                products: 'Refrigerator, Freezer, Range, Oven, Dishwasher, Dryer, Washer',
                method: 'Last 2 letters: 2nd-to-last = year, last = month',
                notes: 'Letters repeat every 12 years. Post-2006 models may use Whirlpool format (acquired by Whirlpool).',
                source: 'lumayeconsulting.com, appliancefactoryparts.com',
                decode: function(serial) {
                    if (!serial || serial.length < 2) return null;
                    
                    const yearCodes = {
                        'C': '1975/1987/1999/2011/2023', 'E': '1977/1989/2001/2013',
                        'G': '1979/1991/2003/2015', 'H': '1980/1992/2004/2016',
                        'L': '1982/1994/2006/2018', 'M': '1983/1995/2007/2019',
                        'N': '1984/1996/2008/2020', 'R': '1985/1997/2009/2021',
                        'S': '1986/1998/2010/2022', 'T': '1987/1999/2011/2023',
                        'U': '1988/2000/2012/2024', 'V': '1989/2001/2013/2025'
                    };
                    
                    const monthCodes = {
                        'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April',
                        'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August',
                        'L': 'September', 'M': 'October', 'N': 'November', 'R': 'December'
                    };
                    
                    const yearChar = serial[serial.length - 2].toUpperCase();
                    const monthChar = serial[serial.length - 1].toUpperCase();
                    
                    return {
                        year: yearCodes[yearChar] || 'Invalid year code',
                        month: monthCodes[monthChar] || 'Invalid month code'
                    };
                }
            },
            
            frigidaire: {
                name: 'Frigidaire',
                products: 'Refrigerator, Freezer, Range, Oven, Dishwasher, Dryer, Washer',
                method: '1st digit after factory code = year; Next 2 digits = week of year',
                notes: 'Year repeats every 10 years. Use context to determine decade.',
                source: 'appliancefactoryparts.com, cannonsappliance.com',
                decode: function(serial) {
                    if (!serial || serial.length < 5) return null;
                    
                    // Skip factory code (first 2 letters), get year digit
                    const yearDigit = serial[2];
                    const week = serial.substring(3, 5);
                    
                    const yearOptions = {
                        '0': '2000/2010/2020', '1': '2001/2011/2021', '2': '2002/2012/2022',
                        '3': '2003/2013/2023', '4': '2004/2014/2024', '5': '2005/2015/2025',
                        '6': '2006/2016', '7': '2007/2017', '8': '2008/2018', '9': '2009/2019'
                    };
                    
                    return {
                        year: yearOptions[yearDigit] || 'Invalid year',
                        month: `Week ${week}`
                    };
                }
            },
            
            lg: {
                name: 'LG',
                products: 'Refrigerator, Freezer, Range, Oven, Dishwasher, Dryer, Washer',
                method: '1st digit = year (last digit); Digits 2-3 = month',
                notes: 'Year is last digit only. Decade not specified - use model/context.',
                source: 'lg.com, homespy.io',
                decode: function(serial) {
                    if (!serial || serial.length < 3) return null;
                    
                    const yearDigit = serial[0];
                    const monthNum = serial.substring(1, 3);
                    
                    const yearOptions = {
                        '0': '2000/2010/2020', '1': '2001/2011/2021', '2': '2002/2012/2022',
                        '3': '2003/2013/2023', '4': '2004/2014/2024', '5': '2005/2015/2025',
                        '6': '2006/2016', '7': '2007/2017', '8': '2008/2018', '9': '2009/2019'
                    };
                    
                    const months = ['', 'January', 'February', 'March', 'April', 'May', 'June',
                                    'July', 'August', 'September', 'October', 'November', 'December'];
                    
                    return {
                        year: yearOptions[yearDigit] || 'Invalid year',
                        month: months[parseInt(monthNum)] || 'Invalid month'
                    };
                }
            },
            
            samsung: {
                name: 'Samsung',
                products: 'Refrigerator, Freezer, Range, Oven, Dishwasher, Dryer, Washer',
                method: '15-digit: 8th char=year, 9th=month. 11-digit: 4th char=year, 5th=month',
                notes: 'Format varies by serial length. 20-year cycle for year codes.',
                source: 'homespy.io, electrical-forensics.com',
                decode: function(serial) {
                    if (!serial || serial.length < 9) return null;
                    
                    let yearPos, monthPos;
                    if (serial.length === 15) {
                        yearPos = 7;
                        monthPos = 8;
                    } else if (serial.length === 11) {
                        yearPos = 3;
                        monthPos = 4;
                    } else {
                        yearPos = 7;
                        monthPos = 8;
                    }
                    
                    const yearCodes = {
                        'R': '2001/2021', 'T': '2002/2022', 'W': '2003/2023', 'X': '2004/2024',
                        'Y': '2005/2025', 'A': '2006/2026', 'P': '2007', 'Q': '2008',
                        'S': '2009', 'Z': '2010', 'B': '2011', 'C': '2012',
                        'D': '2013', 'F': '2014', 'G': '2015', 'H': '2016',
                        'J': '2017', 'K': '2018', 'M': '2019', 'N': '2020'
                    };
                    
                    const monthCodes = {
                        '1': 'January', '2': 'February', '3': 'March', '4': 'April',
                        '5': 'May', '6': 'June', '7': 'July', '8': 'August',
                        '9': 'September', 'A': 'October', 'B': 'November', 'C': 'December'
                    };
                    
                    const year = yearCodes[serial[yearPos].toUpperCase()];
                    const month = monthCodes[serial[monthPos].toUpperCase()];
                    
                    return {
                        year: year || 'Invalid year code',
                        month: month || 'Invalid month code'
                    };
                }
            },
            
            rheem: {
                name: 'Rheem (Water Heater)',
                products: 'Water Heater',
                method: 'First 4 digits: digits 1-2=month, digits 3-4=year',
                notes: 'Year is in YY format (91=1991, 05=2005).',
                source: 'fastwaterheater.com, kcwaterheater.com',
                decode: function(serial) {
                    if (!serial || serial.length < 4) return null;
                    
                    const monthNum = serial.substring(0, 2);
                    const yearNum = serial.substring(2, 4);
                    
                    const months = ['', 'January', 'February', 'March', 'April', 'May', 'June',
                                    'July', 'August', 'September', 'October', 'November', 'December'];
                    
                    const year = parseInt(yearNum) >= 90 ? '19' + yearNum : '20' + yearNum;
                    
                    return {
                        year: year,
                        month: months[parseInt(monthNum)] || 'Invalid month'
                    };
                }
            },
            
            bradford: {
                name: 'Bradford White (Water Heater)',
                products: 'Water Heater',
                method: '1st letter=year (20-year cycle), 2nd letter=month',
                notes: '20-year cycle. Use context for correct decade.',
                source: 'fastwaterheater.com, waterheaterhub.com',
                decode: function(serial) {
                    if (!serial || serial.length < 2) return null;
                    
                    const yearCodes = {
                        'A': '1984/2004/2024', 'B': '1985/2005/2025', 'C': '1986/2006/2026',
                        'D': '1987/2007', 'E': '1988/2008', 'F': '1989/2009',
                        'G': '1990/2010', 'H': '1991/2011', 'J': '1992/2012',
                        'K': '1993/2013', 'L': '1994/2014', 'M': '1995/2015',
                        'N': '1996/2016', 'P': '1997/2017', 'S': '1998/2018',
                        'T': '1999/2019', 'W': '2000/2020', 'X': '2001/2021',
                        'Y': '2002/2022', 'Z': '2003/2023'
                    };
                    
                    const monthCodes = {
                        'A': 'January', 'B': 'February', 'C': 'March', 'D': 'April',
                        'E': 'May', 'F': 'June', 'G': 'July', 'H': 'August',
                        'J': 'September', 'K': 'October', 'L': 'November', 'M': 'December'
                    };
                    
                    return {
                        year: yearCodes[serial[0].toUpperCase()] || 'Invalid year code',
                        month: monthCodes[serial[1].toUpperCase()] || 'Invalid month code'
                    };
                }
            }
        }
    },
    
    electronics: {
        brands: [
            { id: 'samsung-tv', name: 'Samsung TV' },
            { id: 'apple', name: 'Apple' },
            { id: 'xbox', name: 'Microsoft Xbox' }
        ],
        
        decoders: {
            'samsung-tv': {
                name: 'Samsung TV',
                products: 'TV',
                method: 'Serial number 8th char=year (20-year cycle), 9th char=month',
                notes: '15-character serial numbers. 20-year repeat cycle.',
                source: 'Samsung Community, technastic.com',
                decode: function(serial) {
                    if (!serial || serial.length < 9) return null;
                    
                    const yearCodes = {
                        'R': '2001/2021', 'T': '2002/2022', 'W': '2003/2023', 'X': '2004/2024',
                        'Y': '2005/2025', 'A': '2006/2026', 'P': '2007', 'Q': '2008',
                        'S': '2009', 'Z': '2010', 'B': '2011', 'C': '2012',
                        'D': '2013', 'F': '2014', 'G': '2015', 'H': '2016',
                        'J': '2017', 'K': '2018', 'M': '2019', 'N': '2020'
                    };
                    
                    const monthCodes = {
                        '1': 'January', '2': 'February', '3': 'March', '4': 'April',
                        '5': 'May', '6': 'June', '7': 'July', '8': 'August',
                        '9': 'September', 'A': 'October', 'B': 'November', 'C': 'December'
                    };
                    
                    const year = yearCodes[serial[7].toUpperCase()];
                    const month = monthCodes[serial[8].toUpperCase()];
                    
                    return {
                        year: year || 'Invalid year code',
                        month: month || 'Invalid month code'
                    };
                }
            },
            
            apple: {
                name: 'Apple',
                products: 'iPhone, iPad, MacBook, iMac',
                method: 'Complex proprietary system',
                notes: 'Requires lookup tool. Visit everymac.com or Apple support.',
                source: 'beetstech.com, EveryMac.com',
                decode: function(serial) {
                    return {
                        year: 'Use Apple lookup tool',
                        month: 'Requires online decoder'
                    };
                }
            },
            
            xbox: {
                name: 'Microsoft Xbox',
                products: 'Xbox, Xbox 360',
                method: 'Last 5 digits: Y(year) WW(week) FF(factory). Date also printed on label.',
                notes: 'Mfg date on label (YYYY-MM-DD) is more reliable.',
                source: 'informit.com, thetechgame.com',
                decode: function(serial) {
                    if (!serial || serial.length < 5) return null;
                    
                    const yearDigit = serial[serial.length - 5];
                    const week = serial.substring(serial.length - 4, serial.length - 2);
                    
                    return {
                        year: `200${yearDigit} or 201${yearDigit}`,
                        month: `Week ${week}`
                    };
                }
            }
        }
    }
};
