/**
 * ### Модуль менеджера и документа Расчет-заказ
 * Обрботчики событий after_create, after_load, before_save, after_save, value_change
 * Методы выполняются в контексте текущего объекта this = DocObj
 *
 * &copy; Evgeniy Malyarov http://www.oknosoft.ru 2014-2017
 *
 * @module doc_calc_order
 */

// переопределяем формирование списка выбора
$p.doc.calc_order.metadata().tabular_sections.production.fields.characteristic._option_list_local = true;

// подписки на события
$p.doc.calc_order.on({

	// после создания надо заполнить реквизиты по умолчанию: контрагент, организация, договор
	after_create: function (attr) {

		var acl = $p.current_acl.acl_objs,
			obj = this;

		//Организация
		acl.find_rows({
			by_default: true,
			type: $p.cat.organizations.metadata().obj_presentation || $p.cat.organizations.metadata().name}, function (row) {
			obj.organization = row.acl_obj;
			return false;
		});

		//Подразделение
		acl.find_rows({
			by_default: true,
			type: $p.cat.divisions.metadata().obj_presentation || $p.cat.divisions.metadata().name}, function (row) {
			obj.department = row.acl_obj;
			return false;
		});

		//Контрагент
		acl.find_rows({
			by_default: true,
			type: $p.cat.partners.metadata().obj_presentation || $p.cat.partners.metadata().name}, function (row) {
			obj.partner = row.acl_obj;
			return false;
		});

		//Договор
		this.contract = $p.cat.contracts.by_partner_and_org(obj.partner, obj.organization);

		//Менеджер
		obj.manager = $p.current_user;

		//СостояниеТранспорта
		obj.obj_delivery_state = $p.enm.obj_delivery_states.Черновик;

		//Номер документа
		return obj.new_number_doc();

	},

	// перед записью надо присвоить номер для нового и рассчитать итоги
	before_save: function (attr) {

		doc_amount = 0;
		amount_internal = 0;
		sys_profile = "";
		sys_furn = "";

		// если установлен признак проведения, проверим состояние транспорта
		if(this.posted){
			if (this.obj_delivery_state == $p.enm.obj_delivery_states.Отклонен ||
				this.obj_delivery_state == $p.enm.obj_delivery_states.Отозван ||
				this.obj_delivery_state == $p.enm.obj_delivery_states.Шаблон){

				$p.msg.show_msg({
					type: "alert-warning",
					text: "Нельзя провести заказ со статусом<br/>'Отклонён', 'Отозван' или 'Шаблон'",
					title: this.presentation
				});

				return false;

			}else if(this.obj_delivery_state != $p.enm.obj_delivery_states.Подтвержден){
				this.obj_delivery_state = $p.enm.obj_delivery_states.Подтвержден;

			}
		}else if(this.obj_delivery_state == $p.enm.obj_delivery_states.Подтвержден){
			this.obj_delivery_state = $p.enm.obj_delivery_states.Отправлен;
		}

		this.production.each(function (row) {

			doc_amount += row.amount;
			amount_internal += row.amount_internal;

			var name;
			if(!row.characteristic.calc_order.empty()){

				name = row.nom.article || row.nom.nom_group.name || row.nom.id.substr(0, 3);
				if(sys_profile.indexOf(name) == -1){
					if(sys_profile)
						sys_profile += " ";
					sys_profile += name;
				}

				row.characteristic.constructions.each(function (row) {
					if(row.parent && !row.furn.empty()){
						name = row.furn.name_short || row.furn.name;
						if(sys_furn.indexOf(name) == -1){
							if(sys_furn)
								sys_furn += " ";
							sys_furn += name;
						}
					}
				});
			}
		});

		this.doc_amount = doc_amount.round(2);
		this.amount_internal = amount_internal.round(2);
		this.sys_profile = sys_profile;
		this.sys_furn = sys_furn;
		this.amount_operation = $p.pricing.from_currency_to_currency(doc_amount, this.date, this.doc_currency).round(2);

		this._obj.partner_name = this.partner.name;
	},

	// при изменении реквизита
	value_change: function (attr) {

		// реквизиты шапки
		if(attr.field == "organization"){
			this.new_number_doc();
			if(this.contract.organization != attr.value)
				this.contract = $p.cat.contracts.by_partner_and_org(this.partner, attr.value);

		}else if(attr.field == "partner" && this.contract.owner != attr.value){
			this.contract = $p.cat.contracts.by_partner_and_org(attr.value, this.organization);

		// табчасть продукции
		}else if(attr.tabular_section == "production"){

			if(attr.field == "nom" || attr.field == "characteristic"){

			}else if(attr.field == "price" || attr.field == "price_internal" || attr.field == "quantity" ||
				attr.field == "discount_percent" || attr.field == "discount_percent_internal"){

				attr.row[attr.field] = attr.value;

				attr.row.amount = (attr.row.price * ((100 - attr.row.discount_percent)/100) * attr.row.quantity).round(2);

				// если есть внешняя цена дилера, получим текущую дилерскую наценку
				if(!attr.no_extra_charge){
					var prm = {calc_order_row: attr.row},
            extra_charge = $p.wsql.get_user_param("surcharge_internal", "number");

					// если пересчет выполняется менеджером, используем наценку по умолчанию
          if(!$p.current_acl.partners_uids.length || !extra_charge){
            $p.pricing.price_type(prm);
            extra_charge = prm.price_type.extra_charge_external;
          }

					if(attr.field != "price_internal" && extra_charge && attr.row.price){
            attr.row.price_internal = (attr.row.price * (100 - attr.row.discount_percent)/100 * (100 + extra_charge)/100).round(2);
          }
				}

				attr.row.amount_internal = (attr.row.price_internal * ((100 - attr.row.discount_percent_internal)/100) * attr.row.quantity).round(2);

				// ставка и сумма НДС
				if(this.vat_consider){
					attr.row.vat_rate = attr.row.nom.vat_rate.empty() ? $p.enm.vat_rates.НДС18 : attr.row.nom.vat_rate;
					switch (attr.row.vat_rate){
						case $p.enm.vat_rates.НДС18:
						case $p.enm.vat_rates.НДС18_118:
							attr.row.vat_amount = (attr.row.amount * 18 / 118).round(2);
							break;
						case $p.enm.vat_rates.НДС10:
						case $p.enm.vat_rates.НДС10_110:
							attr.row.vat_amount = (attr.row.amount * 10 / 110).round(2);
							break;
						case $p.enm.vat_rates.НДС20:
						case $p.enm.vat_rates.НДС20_120:
							attr.row.vat_amount = (attr.row.amount * 20 / 120).round(2);
							break;
						case $p.enm.vat_rates.НДС0:
						case $p.enm.vat_rates.БезНДС:
							attr.row.vat_amount = 0;
							break;
					}
					if(!this.vat_included){
						attr.row.amount = (attr.row.amount + attr.row.vat_amount).round(2);
					}
				}else{
					attr.row.vat_rate = $p.enm.vat_rates.БезНДС;
					attr.row.vat_amount = 0;
				}

				this.doc_amount = this.production.aggregate([], ["amount"]).round(2);
				this.amount_internal = this.production.aggregate([], ["amount_internal"]).round(2);

				// TODO: учесть валюту документа, которая может отличаться от валюты упр. учета и решить вопрос с amount_operation

			}

		}
	}
});

// свойства и методы объекта
delete $p.DocCalc_order.prototype.contract;
$p.DocCalc_order.prototype.__define({


	/**
	 * Возвращает валюту документа
	 */
	doc_currency: {
		get: function () {
			var currency = this.contract.settlements_currency;
			return currency.empty() ? $p.job_prm.pricing.main_currency : currency;
		}
	},

	/**
	 * При установке договора, синхронно устанавливаем параметры НДС
	 */
	contract: {
		get: function(){return this._getter('contract')},
		set: function(v){
			this._setter('contract',v);
			this.vat_consider = this.contract.vat_consider;
			this.vat_included = this.contract.vat_included;
		}
	},

	dispatching_totals: {
		value: function () {

			options = {
				reduce: true,
				limit: 10000,
				group: true,
				keys: []
			};
			this.production.forEach(function (row) {
				if(!row.characteristic.empty() && !row.nom.is_procedure && !row.nom.is_service && !row.nom.is_accessory){
					options.keys.push([row.characteristic.ref, "305e374b-3aa9-11e6-bf30-82cf9717e145", 1, 0])
				}
			});

			return $p.wsql.pouch.remote.doc.query('server/dispatching', options)
				.then(function (result) {
					var res = {};
					result.rows.forEach(function (row) {
						if(row.value.plan){
							row.value.plan = $p.moment(row.value.plan).format("L")
						}
						if(row.value.fact){
							row.value.fact = $p.moment(row.value.fact).format("L")
						}
						res[row.key[0]] = row.value
					});
					return res;
				});
		}
	},

	/**
	 * Возвращает данные для печати
	 */
	print_data: {
		get: function () {
			var our_bank_account = this.bank_account && !this.bank_account.empty() ? this.bank_account : this.organization.main_bank_account,
				get_imgs = [];

			// заполняем res теми данными, которые доступны синхронно
			var res = {
				АдресДоставки: this.shipping_address,
				ВалютаДокумента: this.doc_currency.presentation,
				ДатаЗаказаФорматD: $p.moment(this.date).format("L"),
				ДатаЗаказаФорматDD: $p.moment(this.date).format("LL"),
				ДатаТекущаяФорматD: $p.moment().format("L"),
				ДатаТекущаяФорматDD: $p.moment().format("LL"),
				ДоговорДатаФорматD: $p.moment(this.contract.date.valueOf() == $p.utils.blank.date.valueOf() ? this.date : this.contract.date).format("L"),
				ДоговорДатаФорматDD: $p.moment(this.contract.date.valueOf() == $p.utils.blank.date.valueOf() ? this.date : this.contract.date).format("LL"),
				ДоговорНомер: this.contract.number_doc ? this.contract.number_doc : this.number_doc,
				ДоговорСрокДействия: $p.moment(this.contract.validity).format("L"),
				ЗаказНомер: this.number_doc,
				Контрагент: this.partner.presentation,
				КонтрагентОписание: this.partner.long_presentation,
				КонтрагентДокумент: "",
				КонтрагентКЛДолжность: "",
				КонтрагентКЛДолжностьРП: "",
				КонтрагентКЛИмя: "",
				КонтрагентКЛИмяРП: "",
				КонтрагентКЛК: "",
				КонтрагентКЛОснованиеРП: "",
				КонтрагентКЛОтчество: "",
				КонтрагентКЛОтчествоРП: "",
				КонтрагентКЛФамилия: "",
				КонтрагентКЛФамилияРП: "",
				КонтрагентЮрФизЛицо: "",
				КратностьВзаиморасчетов: this.settlements_multiplicity,
				КурсВзаиморасчетов: this.settlements_course,
				ЛистКомплектацииГруппы: "",
				ЛистКомплектацииСтроки: "",
				Организация: this.organization.presentation,
				ОрганизацияГород: this.organization.contact_information._obj.reduce(function (val, row) { return val || row.city }, "") || "Москва",
				ОрганизацияАдрес: this.organization.contact_information._obj.reduce(function (val, row) {

					if(row.kind == $p.cat.contact_information_kinds.predefined("ЮрАдресОрганизации") && row.presentation)
						return row.presentation;

					else if(val)
						return val;

					else if(row.presentation && (
							row.kind == $p.cat.contact_information_kinds.predefined("ФактАдресОрганизации") ||
							row.kind == $p.cat.contact_information_kinds.predefined("ПочтовыйАдресОрганизации")
						))
						return row.presentation;

				}, ""),
				ОрганизацияТелефон: this.organization.contact_information._obj.reduce(function (val, row) {

					if(row.kind == $p.cat.contact_information_kinds.predefined("ТелефонОрганизации") && row.presentation)
						return row.presentation;

					else if(val)
						return val;

					else if(row.kind == $p.cat.contact_information_kinds.predefined("ФаксОрганизации") && row.presentation)
						return row.presentation;

				}, ""),
				ОрганизацияБанкБИК: our_bank_account.bank.id,
				ОрганизацияБанкГород: our_bank_account.bank.city,
				ОрганизацияБанкКоррСчет: our_bank_account.bank.correspondent_account,
				ОрганизацияБанкНаименование: our_bank_account.bank.name,
				ОрганизацияБанкНомерСчета: our_bank_account.account_number,
				ОрганизацияИндивидуальныйПредприниматель: this.organization.individual_entrepreneur.presentation,
				ОрганизацияИНН: this.organization.inn,
				ОрганизацияКПП: this.organization.kpp,
				ОрганизацияСвидетельствоДатаВыдачи: this.organization.certificate_date_issue,
				ОрганизацияСвидетельствоКодОргана: this.organization.certificate_authority_code,
				ОрганизацияСвидетельствоНаименованиеОргана: this.organization.certificate_authority_name,
				ОрганизацияСвидетельствоСерияНомер: this.organization.certificate_series_number,
				ОрганизацияЮрФизЛицо: this.organization.individual_legal.presentation,
				ПродукцияЭскизы: {},
				Проект: this.project.presentation,
				СистемыПрофилей: this.sys_profile,
				СистемыФурнитуры: this.sys_furn,
				Сотрудник: this.manager.presentation,
				СотрудникДолжность: this.manager.individual_person.Должность || "менеджер",
				СотрудникДолжностьРП: this.manager.individual_person.ДолжностьРП,
				СотрудникИмя: this.manager.individual_person.Имя,
				СотрудникИмяРП: this.manager.individual_person.ИмяРП,
				СотрудникОснованиеРП: this.manager.individual_person.ОснованиеРП,
				СотрудникОтчество: this.manager.individual_person.Отчество,
				СотрудникОтчествоРП: this.manager.individual_person.ОтчествоРП,
				СотрудникФамилия: this.manager.individual_person.Фамилия,
				СотрудникФамилияРП: this.manager.individual_person.ФамилияРП,
				СотрудникФИО: this.manager.individual_person.Фамилия +
				(this.manager.individual_person.Имя ? " " + this.manager.individual_person.Имя[1].toUpperCase() + "." : "" )+
				(this.manager.individual_person.Отчество ? " " + this.manager.individual_person.Отчество[1].toUpperCase() + "." : ""),
				СотрудникФИОРП: this.manager.individual_person.ФамилияРП + " " + this.manager.individual_person.ИмяРП + " " + this.manager.individual_person.ОтчествоРП,
				СуммаДокумента: this.doc_amount.toFixed(2),
				СуммаДокументаПрописью: this.doc_amount.in_words(),
				СуммаДокументаБезСкидки: this.production._obj.reduce(function (val, row){
					return val + row.quantity * row.price;
				}, 0).toFixed(2),
				СуммаСкидки: this.production._obj.reduce(function (val, row){
					return val + row.discount;
				}, 0).toFixed(2),
				СуммаНДС: this.production._obj.reduce(function (val, row){
					return val + row.vat_amount;
				}, 0).toFixed(2),
				ТекстНДС: this.vat_consider ? (this.vat_included ? "В том числе НДС 18%" : "НДС 18% (сверху)") : "Без НДС",
				ТелефонПоАдресуДоставки: this.phone,
				СуммаВключаетНДС: this.contract.vat_included,
				УчитыватьНДС: this.contract.vat_consider,
				ВсегоНаименований: this.production.count(),
				ВсегоИзделий: 0,
				ВсегоПлощадьИзделий: 0
			};

			// дополняем значениями свойств
			this.extra_fields.forEach(function (row) {
				res["Свойство" + row.property.name.replace(/\s/g,"")] = row.value.presentation || row.value;
			});

			// TODO: дополнить датами доставки и монтажа
			if(!this.shipping_address)
				res.МонтажДоставкаСамовывоз = "Самовывоз";
			else
				res.МонтажДоставкаСамовывоз = "Монтаж по адресу: " + this.shipping_address;

			// получаем логотип организации
			for(var key in this.organization._attachments){
				if(key.indexOf("logo") != -1){
					get_imgs.push(this.organization.get_attachment(key)
						.then(function (blob) {
							return $p.utils.blob_as_text(blob, blob.type.indexOf("svg") == -1 ? "data_url" : "")
						})
						.then(function (data_url) {
							res.ОрганизацияЛоготип = data_url;
						})
						.catch($p.record_log));
					break;
				}
			}

			// получаем эскизы продукций, параллельно накапливаем количество и площадь изделий
			this.production.forEach(function (row) {

				if(!row.characteristic.empty() && !row.nom.is_procedure && !row.nom.is_service && !row.nom.is_accessory){

					res.ВсегоИзделий+= row.quantity;
					res.ВсегоПлощадьИзделий+= row.quantity * row.s;

					get_imgs.push($p.cat.characteristics.get_attachment(row.characteristic.ref, "svg")
						.then(function (blob) {
							return $p.utils.blob_as_text(blob)
						})
						.then(function (svg_text) {
							res.ПродукцияЭскизы[row.characteristic.ref] = svg_text;
						})
						.catch($p.record_log));
				}
			});
			res.ВсегоПлощадьИзделий = res.ВсегоПлощадьИзделий.round(3);

			return (get_imgs.length ? Promise.all(get_imgs) : Promise.resolve([]))
				.then(function () {

					if(!window.QRCode)
						return new Promise(function(resolve, reject){
							$p.load_script("lib/qrcodejs/qrcode.js", "script", resolve);
						});

				})
				.then(function () {

					var svg = document.createElement("SVG");
					svg.innerHTML = "<g />";
					var qrcode = new QRCode(svg, {
						text: "http://www.oknosoft.ru/zd/",
						width: 100,
						height: 100,
						colorDark : "#000000",
						colorLight : "#ffffff",
						correctLevel : QRCode.CorrectLevel.H,
						useSVG: true
					});
					res.qrcode = svg.innerHTML;

					return res;
				});
		}
	},

	/**
	 * Возвращает струклуру с описанием строки продукции для печати
	 */
	row_description: {
		value: function (row) {

			var product = row.characteristic,
				res = {
					НомерСтроки: row.row,
					Количество: row.quantity,
					Ед: row.unit.name || "шт",
					Цвет: product.clr.name,
					Размеры: row.len + "x" + row.width + ", " + row.s + "м²",
					Номенклатура: row.nom.name_full || row.nom.name,
					Характеристика: product.name,
					Заполнения: "",
					Цена: row.price,
					ЦенаВнутр: row.price_internal,
					СкидкаПроцент: row.discount_percent,
					СкидкаПроцентВнутр: row.discount_percent_internal,
					Скидка: row.discount.round(2),
					Сумма: row.amount.round(2),
					СуммаВнутр: row.amount_internal.round(2)
				};

			product.glasses.forEach(function (row) {
				if(res.Заполнения.indexOf(row.nom.name) == -1){
					if(res.Заполнения)
						res.Заполнения += ", ";
					res.Заполнения += row.nom.name;
				}
			});

			return res;
		}
	},

	/**
	 * Заполняет табчасть планирования данными по умолчанию
	 */
	fill_plan: {
		value: function (confirmed) {

			// если табчасть не пустая - задаём вопрос
			if(this.planning.count() && !confirmed){
				dhtmlx.confirm({
					title: $p.msg.main_title,
					text: $p.msg.tabular_will_cleared.replace('%1', "Планирование"),
					cancel: $p.msg.cancel,
					callback: function(btn) {
						if(btn){
							this.fill_plan(true);
						}
					}.bind(this)
				});
				return;
			}

			this.planning.clear();

		}
	}


});

