var custom = '<ul id="api-classes" class="nav nav-list">    \
	<li><a href="../classes/MetaEngine.html">MetaEngine - глобальный объект</a>\
		<ul class="nav nav-list">   \
		<li><a href="../classes/AccountsRegs.html">AccountsRegs</a></li>    \
		<li><a href="../classes/AccumRegManager.html">AccumRegManager</a></li>  \
		</ul>   \
	</li>   \
	</ul>';


module.exports = {

    publicClasses: function(context, options) {
	    'use strict';

	    //return custom;

	    var lc = [], ret = "";

	    context.forEach(function (item) {
		    if(item.menuorder)
			    lc.push(item);
	    });
	    lc.sort(function (a, b) {
		    return(parseInt(a.menuorder) - parseInt(b.menuorder));
	    });

	    lc.forEach(function (item) {
		    if(!item.itemtype && item.access === 'public') {
			    var tmp = options.fn(item);
			    if(item.tooltip)
				    tmp = tmp.replace('</a></li>', '</a> ' + item.tooltip + '</li>')
			    ret += tmp;

		    } else if (item.itemtype) {
			    ret = ret + options.fn(item);
		    }
	    });

	    // for(var i=0; i < context.length; i++) {
	    //
	    //    if(lc.indexOf(context[i]) != -1)
	    //        continue;
	    //
	    //     if(!context[i].itemtype && context[i].access === 'public') {
	    //         ret = ret + options.fn(context[i]);
	    //     } else if (context[i].itemtype) {
	    //         ret = ret + options.fn(context[i]);
	    //     }
	    // }

	    return ret;
    },

    search : function(classes, modules) {
        'use strict';
        var ret = '';

        for(var i=0; i < classes.length; i++) {
            if(i > 0) {
                ret += ', ';
            }
            ret += "\"" + 'classes/' + classes[i].displayName + "\"";
        }

        if(ret.length > 0 && modules.length > 0) {
            ret += ', ';
        }

        for(var j=0; j < modules.length; j++) {
            if(j > 0) {
                ret += ', ';
            }
            ret += "\"" + 'modules/' + modules[j].displayName + "\"";
        }

        return ret;
    },

	metadata: function(item) {
		return "Dav Glass says: " + item
	}
};
