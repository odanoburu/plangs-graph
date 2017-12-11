var wikidataUrl = 'https://query.wikidata.org/bigdata/namespace/wdq/sparql';

var query = `SELECT ?langId ?langLabel (MIN(?langYear) as ?languageYear) ?influencedId ?influencedLabel
WHERE {
  ?lang (wdt:P31/wdt:P279*) wd:Q9143.
  BIND(SUBSTR(STR(?lang), STRLEN(STR(wd:)) + 2) AS ?langId)
  OPTIONAL { ?lang wdt:P571 ?langDate. }
  OPTIONAL { ?lang wdt:P577 ?langPub. }
  BIND(IF(BOUND(?langDate), ?langDate, ?langPub) AS ?langDate)
  BIND(IF(BOUND(?langDate), YEAR(?langDate), "<nothing>") AS ?langYear)
  OPTIONAL { ?influenced (wdt:P31/wdt:P279*) wd:Q9143;
                          wdt:P737 ?lang. }
  BIND(IF(BOUND(?influenced), SUBSTR(STR(?influenced), STRLEN(STR(wd:)) + 2), "<nothing>") AS ?influencedId)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?langId ?langLabel ?influencedId ?influencedLabel`;

d3.sparql(wikidataUrl, query).get(function(error, query_data) {
    if (error) throw error;

    // nest by ID
    var influenceData = d3.nest()
        .key(function(d) { return d.langId; })
        .entries(query_data);
    
    // returns [{"key": year, "values": [{langId: "837537", langLabel:
    // "QBasic", languageYear: "1991", influencedId: "8335348",
    // influencedLabel: "FreeBASIC", influencedYear: "2004"} ...]...]
    var completeYearData = d3.nest()
        .key(function(d) { return d.languageYear; })
        .entries(query_data);

    var yearData = [],
        missingYearData = [];

    // sort by inception date presence
    completeYearData.forEach(function (d) {if (d.key == "<nothing>") {
        missingYearData.push(d);
    } else {
        yearData.push(d);}});

    // no need for key here, as there's only one
    missingYearData = missingYearData[0];

    // x-axis is arranged according to inception year
    var [xMin, xMax] = d3.extent(yearData,
                                 function(d) {return parseInt(d.key,10);});

    // y-axis size is determined by maximum number of influences
    // accross array
    var ySize = d3.max(yearData, function(d) {return d.values.length;});

    /// layout vars and scale functions
    var nodeRadius = 5, // radius base size
        radiusSpan = 5, // how much the radius varies according to influence
        horizontalOffset = 30,
        verticalOffset = 30,
        nodeHeight = 2*nodeRadius*radiusSpan + verticalOffset,
        yearWidth = 2*nodeRadius*radiusSpan + horizontalOffset;
    
    // In the SVG container the top-left corner is (0,0) . It is the
    // origin and the x axis runs from left to right and y axis runs
    // from top to bottom.
    var svg = d3.select("svg"),
        height = nodeHeight * ySize,
        realHeight = height + nodeHeight * 3, // space for no-date
                                              // nodes
        width = yearWidth * Math.max(yearData.length, missingYearData.values.length),
        realWidth = width + yearWidth * 3;
    
    var xScale = d3.scaleLinear()
        .domain([xMin, xMax])
        .range([yearWidth, width]);
    
    //// make map of coordinates of every language node
    var countMap = new Map(),
        xCoordMap = new Map(),
        yCoordMap = new Map(),
        maxInfluence = 0;

    for (let element of influenceData) {
        let influenceSize = element.values.length;
        if (influenceSize > maxInfluence) { maxInfluence = influenceSize; };
        countMap.set(element.key, influenceSize);
    };

    function influenceCountComp (a,b) {
        if (countMap.get(a.langId) > countMap.get(b.langId)) {
            return 1;
        }
        if (countMap.get(a.langId) < countMap.get(b.langId)) {
            return -1;
        }
        return 0;
    };

    // coordinates for nodes without inception: x-axis according to
    // index
    var noInceptionXScale = d3.scaleLinear()
        .domain([0, missingYearData.values.length])
        .range([yearWidth, width]);

    var sortedNoInceptionLangs = missingYearData.values.sort(influenceCountComp),
        index = 0;
    for (let lang of sortedNoInceptionLangs) {
        xCoordMap.set(lang.langId, yearWidth + noInceptionXScale(index));
        yCoordMap.set(lang.langId, 2*nodeHeight + height); // y-axis constant
        index += 1;
    };

    // coordinates for nodes with inception
    for (let yearNest of yearData) {
        var yearNum = parseInt(yearNest["key"], 10),
            sortedLangs = yearNest.values.sort(influenceCountComp),
            langsNum = sortedLangs.length,
            leftBound = nodeHeight,
            ySpace = height - nodeHeight;
        for (let lang of sortedLangs) {
            let rightBound = leftBound + ySpace/langsNum,
                thisY = d3.randomUniform(leftBound, rightBound)();
            xCoordMap.set(lang.langId, xScale(yearNum));
            yCoordMap.set(lang.langId, thisY);
            leftBound = thisY;
        }
    };
    ////

    var nodeActiveColour = "#558E6F",
        linkActiveColour = "#818182";

    var graph = svg.append("g")
        .classed("graph", true);

    var yearLabels = graph.selectAll("text")
        .data(yearData)
        .enter()
        .append("text")
        .attr("x", function(d){ return xScale(parseInt(d.key, 10)); })
        .attr("y", nodeHeight/2)
        .text(function(d){ return d.key; });

    var gLangs = graph.selectAll("g")
        .data(influenceData)
        .enter()
        .append("g")
        .attr("id", function(d) {return d.key;});

    var radiusScale = d3.scaleLinear()
        .domain([0, maxInfluence])
        .range([nodeRadius, radiusSpan*nodeRadius]);

    var gNodes = gLangs.append("circle")
        .attr("r", function(d) { return radiusScale(countMap.get(d.key)); })
        .attr("cx", function(d) { return xCoordMap.get(d.key); })
        .attr("cy", function(d) { return yCoordMap.get(d.key); })
        .style("fill", nodeActiveColour)
        .text(function(d) {return d.values[0].langLabel;})
        .attr("id", function(d) {return d.key;});

    gLangs.each(function(d,i) {
        var lang = d3.select(this);

        let x1 = xCoordMap.get(d.key),
            y1 = yCoordMap.get(d.key);

        if (d.values[0].influencedId != "<nothing>") {
            lang.selectAll("line")
                .data(d.values)
                .enter()
                .append("line")
                .attr("x1", x1)
                .attr("y1", y1)
                .attr("x2", function(d) {return xCoordMap.get(d.influencedId);})
                .attr("y2", function(d) {return yCoordMap.get(d.influencedId);})
                .style("stroke-width", "1")
                .style("stroke-opacity", "0.8")
                .style("stroke", linkActiveColour);
        }

        lang.append("text")
            .attr("x",x1)
            .attr("y",y1 - nodeRadius)
            .attr("transform", "rotate(30 " + x1 +','+y1+')')
            .text(d.values[0].langLabel);
    });

    gLangs.on("click", highlightChildren);

    function highlightChildren(d) {
        gLangs.selectAll("circle")
            .attr("fill-opacity", "0.5");
        gLangs.selectAll("line")
            .attr("stroke-opacity", "0.2");

        var lang = d3.select(this);

        lang.selectAll("line")
            .attr("stroke-opacity", "1");
        lang.select("circle")
            .attr("fill-opacity", "1");
    };
    
    // zoom + pan
    var langsPan = svgPanZoom("#mainView", {
        viewportSelector: ".svg-pan-zoom_viewport"
        , preventMouseEventsDefault: true
        , zoomScaleSensitivity: 1.25
        , maxZoom: 100
    });
});
