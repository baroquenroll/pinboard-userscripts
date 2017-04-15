// ==UserScript==
// @name Prompt Meme Pinboardizer
// @namespace http://lepermessiah.net
// @description Converts LiveJournal/Dreamwidth-based kinkmeme prompts to Pinboard bookmarks.
// @include http://*.dreamwidth.org/*.html*
// @include https://*.dreamwidth.org/*.html*
// @include http://*.livejournal.com/*.html*
// @include https://*.livejournal.com/*.html*
// @require http://ajax.googleapis.com/ajax/libs/jquery/2.2.0/jquery.min.js
// @grant none
// ==/UserScript==

/*** CONFIG ***/

var backdateTimestamps = true;
// Set to true if you want to set bookmark timestamps to the date the original comment was posted.

var pinboardApiToken = "";
// To auto-add bookmarks with a single button click (SLOW), paste your API token
// from Settings > Password between the quotes.
// If left blank, you will instead get an XML snippet that you can copy into a text file for import.

var filledTag = "-filled";
var unfilledTag = "-unfilled";
var charTagPrefix = "char:";
var characterTags = ["", ""];
// AUTO-TAGGING INSTRUCTIONS
// To enable auto-tagging of fills, enter your Pinboard's filled/unfilled tags
// To enable auto-tagging of characters, enter your Pinboard's prefix for character tags
// and a list of character names to search for
// ALWAYS MANUALLY REVIEW THE AUTO-TAG SUGGESTIONS BEFORE COPYING OR HITTING 'SUBMIT'

/*** CODE ***/

/* * * * SELECTORS * * * *
 * Site-dependent selectors for prompts (top-level comments) and their permalinks,
 * timestamps, subject lines, and body text
 * * * * * * * * * * * * */
 
 var ljSelectors = {
     'getTopLevelComments' : function() {
         return $("div.comment-menu").not(":contains('Parent')").parent(); 
     },
     'getSubthreadComments' : function(comment) { 
        return $(comment).nextUntil(selectors.getTopLevelComments()).filter("div.comment-wrap");
     },
     'getPermalink' : function(comment) {
         return $(comment).find("a.comment-permalink").attr("href");
     },
     'getTimestamp' : function(comment) {
         return $(comment).find("span.comment-datetimelink:first").text();
     },
     'getSubject' : function(comment) {
        if($(comment).hasClass("partial")) {
            return $(comment).children("a[href]").first().text().trim();
        } else {
            return $(comment).find("h3").first().text().trim();
        }
     },
     'getCommentBody' : function(comment) {
        return $(comment).find("div.comment-text").html();
     },
     'getCommentingLinks' : function() {
        return $("div.comments-links");
     },
     'addCommentingLink' : function(commentingLinks, linkHtml) {
        $(commentingLinks).find(".replylink").after("<span class='emdash'> &mdash; </span>" + linkHtml);
     }
 };

var dwSelectors = {
     'getTopLevelComments' : function() { 
        return $("div.comment-depth-1 > div.dwexpcomment");
     },
     'getSubthreadComments' : function(comment) { 
        return $(comment).parent().nextUntil($("div.comment-depth-1"));
     },
     'getPermalink' : function(comment) {
        return $(comment).find(".commentpermalink > a").attr("href");
     },
     'getTimestamp' : function(comment) {
         return $(comment).find("span.datetime > span:last-child:first").text();
     },
     'getSubject' : function(comment) {
         return $(comment).find(".comment-title:first").text().trim();
     },
     'getCommentBody' : function(comment) {
         return $(comment).find("div.comment-content").html();
     },
     'getCommentingLinks' : function() {
         return $("ul.entry-interaction-links");
     },
     'addCommentingLink' : function(commentingLinks, linkHtml) {
         $(commentingLinks).append("<li>" + linkHtml + "</li>");
     }
};

// detect LiveJournal or Dreamwidth and set selectors
var selectors;
if(window.location.hostname.search("livejournal.com") >= 0) {
    selectors = ljSelectors;
}
if(window.location.hostname.search("dreamwidth.org") >= 0) {
    selectors = dwSelectors;
}

// Insert Pinboardize link+form
var pinboardizeLink = "<a href=\"javascript:$('.pinboardizeForm').toggle();\">Show/Hide Pinboard Export Form</a>";
var commentLinks = selectors.getCommentingLinks();
selectors.addCommentingLink(commentLinks, pinboardizeLink);

// On button click:
// * Find top-level comments
// *** Extract link, timestamp, subject, comment text
// *** Create auto-tagging suggestions
// *** Package into XML <post /> tag
// * Concatenate <post /> tags
// * Insert textarea with concatenated <post />s as text

var promptComments = selectors.getTopLevelComments();
var xmlTextArea = "<textarea rows='10' cols='120' class='pinboardizeForm' style='display:none;'>";
promptComments.each(function() {
    var promptXmlTag = assemblePostData($(this));
    xmlTextArea += (promptXmlTag + "\n\n");
});
xmlTextArea += "</textarea><br/>";

$(commentLinks).before(xmlTextArea);

/* * * * FUNCTIONS * * * *
 * Functions that aren't dependent on site-specific CSS selectors.
 * * * * * * * * * * * */

function assemblePostData(comment) {
    var permalink = selectors.getPermalink(comment);
    var subject = selectors.getSubject(comment);
    if(!subject) subject = "(no subject)";
    var timestamp = selectors.getTimestamp(comment);
    var commentBody = selectors.getCommentBody(comment);
    var postTags = generateTags(subject, comment);
    return convertToXml(permalink, subject, timestamp, commentBody, postTags);
}

function convertToXml(permalink, subject, timestamp, commentBody, postTags) {
    var postXml = "";
    if(permalink && subject) {
        postXml = "&lt;post href=\"" + permalink + "\"";
        if(backdateTimestamps && timestamp) {
            postXml += " time=\"" + convertTimestamp(timestamp) + "\"";
        }
        postXml += " description=\"" + encodeXmlEntities(subject) + "\"";
        if(commentBody) {
            postXml += " extended=\"" + encodeXmlEntities(commentBody) + "\"";
        }
        if(postTags) {
            postXml += " tag=\"" + encodeXmlEntities(postTags) + "\"";
        }
        postXml +=" /&gt;";
    }
    console.log(postXml);
    return postXml;
}

function convertToApiRequest(baseUrl, permalink, subject, timestamp, commentBody, postTags) {
    // not actually tested/working
    var req = "";
    if(baseUrl && permalink && subject) {
        req = baseUrl + "add?url=" + encodeURIComponent(permalink) + "&description=" + encodeURIComponent(subject);
        if(timestamp) {
            // todo
        }
        if(commentBody) {
            req += "&extended=" + encodeURIComponent(commentBody);
        }
        if(postTags) {
            // todo
        }
    }
    return req;
}

function convertTimestamp(timestamp) {
    // assumes format is "2000-01-01 12:01 am (UTC)"
    var parts = timestamp.split(" ");
    var isUTC = (timestamp.indexOf("UTC") > -1);
    // change 12:xx am to 00:xx
    if(parts[2] == "am" && parts[1].startsWith("12")) {
        parts[1] = "00" + parts[1].substr(2);
    }
    // convert 1pm and up to 24h time
    if(parts[2] == "pm" && !parts[1].startsWith("12")) {
        var hh = Number(parts[1].substr(0,2));
        hh = hh + 12;
        parts[1] = String(hh) + parts[1].substr(2);
    }
    // return in ISO date/time format
    return parts[0] + "T" + parts[1] + (isUTC ? "Z" : "");
}

function generateTags(subject, comment) {
    var tagList=[];
    if(autoTagFill(comment)) {
        tagList.push(filledTag);
    } else {
        tagList.push(unfilledTag);
    }
    var charTags = autoTagCharacters(subject, selectors.getCommentBody(comment));
    if(charTags) {
        tagList.push(charTags);
    }
    return tagList.join(" ");
}

function autoTagFill(comment) {
    // get subject lines of child comments if different from OP
    // look for keywords: fill, minifill, mini-fill, ignorewhitespace(#/?, #/#, part #, #n/#)
    var searchTerms = /(\bfill\b|mini.?fill|part \d)/i;
    var numericSearch = /\d[A-z]?\s?\/\s?(\d|\?)/;
    var children = selectors.getSubthreadComments(comment);
    for(var i=0; i<children.length; i++) {
        var thisSubject = selectors.getSubject(children[i]);
        if(searchTerms.test(thisSubject) || numericSearch.test(thisSubject)) {
            return true;
        }
    }
    return false;
}

function autoTagCharacters(subject, comment) {
    var charactersFound = [];
    var searchText = subject.concat(" ", comment).toLowerCase();
    for(var i=0; i<characterTags.length; i++) {
        if(searchText.indexOf(characterTags[i].toLowerCase()) > -1) {
            charactersFound.push(charTagPrefix + characterTags[i]);
        }
    }
    return charactersFound.join(" ");
}

function encodeXmlEntities(str) {
    str = str.replace(/<wbr>/g, "");
    str = str.replace(/<br>/g, " ");
    // TODO find a way to preserve line breaks that won't be eaten by Pinboard import
    str = str.replace(/[<>"]/g, function (c) {
        switch (c) {
            //case '&': return '&amp;amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            //case '\'': return '&amp;apos;';
            case '"': return '&amp;quot;';
        }
    });
    return str;//.replace(/\n/g, "\n<br>");
}