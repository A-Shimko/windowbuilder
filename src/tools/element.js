/**
 * Виртуальный инструмент - прототип для инструментов _select_node_ и _select_elm_
 * Created 12.03.2016<br />
 * @author Evgeniy Malyarov
 * @module element
 */

function ToolElement() {
	ToolElement.superclass.constructor.call(this);
};
ToolElement._extend(paper.Tool);

ToolElement.prototype.__define({

	/**
	 * Отключает и выгружает из памяти окно свойств инструмента
	 * @param tool
	 */
	detache_wnd: {
		value: function(){
			if(this.wnd && this.wnd.wnd_options){
				this.wnd.wnd_options(this.options.wnd);
				$p.wsql.save_options("editor", this.options);
				this.wnd.close();
			}
			this.wnd = null;
			this.profile = null;
		},
		enumerable: false
	},

	/**
	 * Подключает окно редактор свойств текущего элемента, выбранного инструментом
	 */
	attache_wnd: {
		value: function(profile, _editor){

			this.profile = profile;

			if(!this.wnd || !this._grid){

				this.wnd = _editor._acc.elm.cells("a");

				this._grid = this.wnd.attachHeadFields({
					obj: profile,
					oxml: {
						" ": ["inset", "clr"],
						"Начало": ["x1", "y1"],
						"Конец": ["x2", "y2"]

					}
				});
				this._grid.attachEvent("onRowSelect", function(id,ind){
					if(id == "x1" || id == "y1")
						this._obj.select_node("b");
					else if(id == "x2" || id == "y2")
						this._obj.select_node("e");
				});
			}else{
				this._grid.attach({obj: profile})
			}
		},
		enumerable: false
	}

});
