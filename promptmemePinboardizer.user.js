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
         return $(comment).find("span.datetimelink:first").text();
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
         return $(comment).find(".comment-title:first").text().trim()
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
    if(!subject.length) subject = "(no subject)";
    var timestamp = selectors.getTimestamp(comment);
    var commentBody = selectors.getCommentBody(comment);
    var postTags = generateTags(comment);
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
    // not actually tested/working
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

function generateTags(comment) {
    var tagList="";
    if(autoTagFill(comment)) {
        tagList += filledTag;
    } else {
        tagList += unfilledTag;
    }
    return tagList;
}

function autoTagFill(comment, siteName) {
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