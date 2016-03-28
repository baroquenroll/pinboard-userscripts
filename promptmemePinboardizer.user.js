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

var backdateTimestamps = false;
// Set to true if you want to set bookmark timestamps to the date the original comment was posted.

var pinboardApiToken = "";
// To auto-add bookmarks with a single button click (SLOW), paste your API token
// from Settings > Password between the quotes.
// If left blank, you will instead get an XML snippet that you can copy into a text file for import.

var filledTag = "-filled";
var unfilledTag = "-unfilled";
var charTagPrefix = "";
//var characterTags = ["", ""];
// AUTO-TAGGING: NOT IMPLEMENTED YET
// To enable auto-tagging of fills, enter your Pinboard's fill tag
// To enable auto-tagging of characters, enter your Pinboard's prefix for character tags
// and a list of character names to search for
// ALWAYS MANUALLY REVIEW THE AUTO-TAG SUGGESTIONS BEFORE COPYING OR HITTING 'SUBMIT'

/*** CODE ***/

/* * * * SELECTORS * * * *
 * Site-dependent selectors for prompts (top-level comments) and their permalinks,
 * timestamps, subject lines, and body text
 * * * * * * * * * * * * */

function getTopLevelComments(siteName) {
    if(siteName === "lj") {
        return $("div.comment-menu").not(":contains('Parent')").parent();
    }
    if(siteName === "dw") {
        return $("div.comment-depth-1 > div.dwexpcomment");
    }
}

function getChildSubjectLines(comment, siteName) {
    var children;
    if(siteName === "lj") {
        children = $(comment).nextUntil(getTopLevelComments(siteName)).filter("div.comment-wrap");
    }
    if(siteName === "dw") {
        children = $(comment).parent().nextUntil($("div.comment-depth-1"));
    }
    var childSubjectLines = [];
    children.each(function(index) {
        if(siteName === "dw") {
            childSubjectLines.push($(this).find(".comment-title").text());
        }
        else if($(this).hasClass("partial")) {
            childSubjectLines.push($(this).children("a[href]").text());
        } else {
            childSubjectLines.push($(this).find("h3").text());
        }
    });
    return childSubjectLines;
}

function getPermalink(comment, siteName) {
    if(siteName === "lj") {
        return $(comment).find("a.comment-permalink").attr("href");
    }
    if(siteName === "dw") {
        return $(comment).find(".commentpermalink > a").attr("href");
    }
}

function getTimestamp(comment, siteName) {
    if(siteName === "lj") {
        return $(comment).find("span.datetimelink:first").text();
    }
    if(siteName === "dw") {
        return $(comment).find("span.datetime > span:last-child:first").text();
    }
}

function getSubject(comment,siteName) {
    if(siteName === "lj") {
        return $(comment).find(".comment-head h3:first").text().trim();
    }
    if(siteName === "dw") {
        return $(comment).find(".comment-title:first").text().trim();
    }
}

function getCommentBody(comment,siteName) {
    if(siteName === "lj") {
        return $(comment).find("div.comment-text").html();
    }
    if(siteName === "dw") {
        return $(comment).find("div.comment-content").html();
    }
}

function getTags(comment,siteName) {
    var tagList="";
    if(autoTagFill(comment,siteName)) {
        tagList += filledTag;
    } else {
        tagList += unfilledTag;
    }
    return tagList;
}

// detect LiveJournal or Dreamwidth
var currentSiteName = "";
if(window.location.hostname.search("livejournal.com") >= 0) {
    currentSiteName = "lj";
}
if(window.location.hostname.search("dreamwidth.org") >= 0) {
    currentSiteName = "dw";
}
console.log("current site name: " + currentSiteName);

// Insert Pinboardize link+form
var pinboardizeLink = "";
var commentLinks = "";
if(currentSiteName === "dw") {
    commentLinks = $("ul.entry-interaction-links");
    commentLinks.append("<li><a href=\"javascript:$('.pinboardizeForm').toggle();\">Show/Hide Pinboard Export Form</a></li>");
}
if(currentSiteName === "lj") {
    commentLinks = $("div.comments-links");
    commentLinks.find(".replylink").after("<span class='emdash'> &mdash; </span><a href=\"javascript:$('.pinboardizeForm').toggle();\">Show/Hide Pinboard Export Form</a>");
}
console.log("comment links: " + $(commentLinks).text());

// On button click:
// * Find top-level comments
// *** Extract link, timestamp, subject, comment text
// *** Create auto-tagging suggestions
// *** Package into XML <post /> tag
// * Concatenate <post /> tags
// * Insert textarea with concatenated <post />s as text

var promptComments = getTopLevelComments(currentSiteName);
var xmlTextArea = "<textarea rows='10' cols='80' class='pinboardizeForm' style='display:none;'>";
for(var i=0; i<promptComments.length; i++) {
    var promptXmlTag = assemblePostData(promptComments[i], currentSiteName);
    xmlTextArea += (promptXmlTag + "\n\n");
}
xmlTextArea += "</textarea><br/>";

$(commentLinks).before(xmlTextArea);

function assemblePostData(comment, siteName) {
    var permalink = getPermalink(comment, siteName);
    var subject = getSubject(comment, siteName);
    if(!subject.length) subject = "(no subject)";
    var timestamp = "";
    var commentBody = "";
    var postTags = "";
    if(permalink.length) {
        timestamp = getTimestamp(comment, siteName);
        commentBody = getCommentBody(comment, siteName);
        postTags = getTags(comment, siteName);
    }
    return convertToXml(permalink, subject, timestamp, commentBody, postTags);
}

function convertToXml(permalink, subject, timestamp, commentBody, postTags) {
    var postXml = "";
    if(permalink.length && subject.length) {
        postXml = "&lt;post href=\"" + permalink + "\"";
        // todo: convert timestamp
        postXml += " description=\"" + encodeXmlEntities(subject) + "\"";
        if(commentBody.length) {
            postXml += " extended=\"" + encodeXmlEntities(commentBody) + "\"";
        }
        if(postTags.length) {
            postXml += " tag=\"" + encodeXmlEntities(postTags) + "\"";
        }
        postXml +=" /&gt;";
    }
    console.log(postXml);
    return postXml;
}

function convertToApiRequest(baseUrl, permalink, subject, timestamp, commentBody, postTags) {
    var req = "";
    if(baseUrl.length && permalink.length && subject.length) {
        req = baseUrl + "add?url=" + encodeURIComponent(permalink) + "&description=" + encodeURIComponent(subject);
        if(timestamp.length) {
            // todo
        }
        if(commentBody.length) {
            req += "&extended=" + encodeURIComponent(commentBody);
        }
        if(postTags.length) {
            // todo
        }
    }
    return req;
}

function autoTagFill(comment, siteName) {
    // get subject lines of child comments if different from OP
    // look for keywords: fill, minifill, mini-fill, ignorewhitespace(#/?, #/#, part #, #n/#)
    var searchTerms = /(\bfill\b|mini.?fill|part \d)/i;
    var numericSearch = /\d[A-z]?\s?\/\s?(\d|\?)/;
    var childSubjectLines = getChildSubjectLines(comment, siteName);
    for(var i=0; i<childSubjectLines.length; i++) {
        if(searchTerms.test(childSubjectLines[i]) || numericSearch.test(childSubjectLines[i])) {
            return true;
        }
    }
    return false;
}

function encodeXmlEntities(str) {
    str = str.replace(/<wbr>/g, "");
    str = str.replace(/<br>/g, "\n");
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