/* Centralized manufacturer founding facts — keyed by brand slug. */
var BRAND_FACTS = {
  ge: {
    founded: '1892',
    founder: 'Thomas Edison, Charles Coffin, Elihu Thomson & Edwin Houston',
    location: 'Schenectady, New York, USA',
    summary: 'General Electric was incorporated in 1892 through a merger of Edison General Electric and Thomson-Houston Electric Company in Schenectady, New York, uniting the pioneering work of Thomas Edison and Charles Coffin.'
  },
  whirlpool: {
    founded: '1911',
    founder: 'Louis Upton and Emory Upton',
    location: 'St. Joseph, Michigan, USA',
    summary: 'Whirlpool was founded in 1911 by brothers Louis and Emory Upton as the Upton Machine Company in St. Joseph, Michigan, initially producing motor-driven wringer washing machines.'
  },
  samsung: {
    founded: '1969',
    founder: 'Lee Byung-chul',
    location: 'Suwon, South Korea',
    summary: 'Samsung Electronics was established in 1969 by Lee Byung-chul in Suwon, South Korea, initially manufacturing televisions and other consumer electronics before expanding into a global technology leader.'
  },
  lg: {
    founded: '1958',
    founder: 'Koo In-hwoi',
    location: 'Seoul, South Korea',
    summary: "LG Electronics traces its roots to GoldStar, founded in 1958 by Koo In-hwoi in Seoul, South Korea, as the country's first consumer electronics manufacturer, producing radios and televisions."
  },
  bosch: {
    founded: '1886',
    founder: 'Robert Bosch',
    location: 'Stuttgart, Germany',
    summary: 'Robert Bosch GmbH was founded in 1886 by Robert Bosch in Stuttgart, Germany, as a workshop for precision mechanics and electrical engineering.'
  },
  maytag: {
    founded: '1893',
    founder: 'Frederick Maytag I',
    location: 'Newton, Iowa, USA',
    summary: 'Maytag was founded in 1893 by Frederick Maytag in Newton, Iowa, initially producing farm equipment before becoming one of America\'s most recognized home appliance brands.'
  },
  frigidaire: {
    founded: '1916',
    founder: 'Alfred Mellowes',
    location: 'Dayton, Ohio, USA',
    summary: 'Frigidaire was founded in 1916 by Alfred Mellowes in Dayton, Ohio, under the name Guardian Frigerator Company, as one of the first manufacturers of self-contained household refrigerators.'
  },
  kenmore: {
    founded: '1927',
    founder: 'Sears, Roebuck and Co.',
    location: 'Chicago, Illinois, USA',
    summary: 'The Kenmore brand was introduced in 1927 by Sears, Roebuck and Co. in Chicago, Illinois, as a house brand for washing machines, later expanding to cover a full range of home appliances sold through Sears stores.'
  },
  apple: {
    founded: '1976',
    founder: 'Steve Jobs, Steve Wozniak & Ronald Wayne',
    location: 'Cupertino, California, USA',
    summary: 'Apple was founded on April 1, 1976 by Steve Jobs, Steve Wozniak, and Ronald Wayne in Cupertino, California, initially selling the hand-built Apple I computer before revolutionizing personal computing, music, phones, and tablets.'
  },
  hp: {
    founded: '1939',
    founder: 'Bill Hewlett & Dave Packard',
    location: 'Palo Alto, California, USA',
    summary: 'Hewlett-Packard was founded in 1939 by Bill Hewlett and Dave Packard in a garage in Palo Alto, California — widely considered the birthplace of Silicon Valley — initially producing electronic test and measurement instruments.'
  },
  asus: {
    founded: '1989',
    founder: 'T.H. Tung, Ted Hsu, Wayne Tsiah & M.T. Liao',
    location: 'Taipei, Taiwan',
    summary: 'ASUS was founded in 1989 by four former Acer engineers in Taipei, Taiwan, initially designing motherboards before expanding into laptops, desktops, monitors, and a full range of consumer and professional computing hardware.'
  },
  google_pixel: {
    founded: '1998',
    founder: 'Larry Page & Sergey Brin',
    location: 'Menlo Park, California, USA',
    summary: 'Google was founded in 1998 by Larry Page and Sergey Brin at Stanford University, growing into Alphabet Inc. The Pixel hardware line, launched in 2016, brought Google\'s vision of a pure Android experience and on-device AI to smartphones and tablets.'
  },
  sony: {
    founded: '1946',
    founder: 'Masaru Ibuka & Akio Morita',
    location: 'Tokyo, Japan',
    summary: 'Sony was founded in 1946 by Masaru Ibuka and Akio Morita in Tokyo, Japan, as Tokyo Tsushin Kogyo (Tokyo Telecommunications Engineering Corporation), and grew into one of the world\'s leading consumer electronics companies, known for the Walkman, Trinitron TV, and PlayStation.'
  },
  vizio: {
    founded: '2002',
    founder: 'William Wang',
    location: 'Irvine, California, USA',
    summary: 'VIZIO was founded in 2002 by William Wang in Irvine, California, with a mission to deliver high-quality flat-panel televisions at accessible prices, quickly becoming one of the top-selling TV brands in the United States by leveraging an efficient direct-to-retail distribution model.'
  },
  panasonic: {
    founded: '1918',
    founder: 'Kōnosuke Matsushita',
    location: 'Osaka, Japan',
    summary: 'Panasonic (originally Matsushita Electric Industrial Co.) was founded in 1918 by Kōnosuke Matsushita in Osaka, Japan, starting with a simple duplex lamp socket and growing into a global electronics giant known for TVs, cameras, batteries, and industrial solutions.'
  }
};
