require('dotenv').config({ path: './.env.local' })
const appRoot = require('app-root-path')
const fs = require('fs')
const { GoogleSpreadsheet } = require('google-spreadsheet')
const { Parser } = require('i18next-scanner')

// Scanner
const parser = new Parser({
	input: [
		'app/**/*.{js,jsx}',
		'app/**/*.{ts,tsx}',
		// Use ! to filter out files or directories
		'!app/**/*.spec.{js,jsx}',
		'!app/i18n/**',
		'!**/node_modules/**',
	],
	output: './',
	options: {
		debug: true,
		func: {
			list: ['i18next.t', 'i18n.t'],
			extensions: ['.js', '.jsx', '.ts', '.tsx'],
		},
		trans: {
			component: 'Trans',
			i18nKey: 'i18nKey',
			defaultsKey: 'defaults',
			extensions: ['.js', '.jsx', '.ts', '.tsx'],
			fallbackKey: function (ns, value) {
				return value
			},
			acorn: {
				ecmaVersion: 2020,
				sourceType: 'module', // defaults to 'module'
				// Check out https://github.com/acornjs/acorn/tree/master/acorn#interface for additional options
			},
		},
		// lngs: ['en', 'ko'],
		// ns: ['locale', 'resource'],
		// defaultLng: 'en',
		// defaultNs: 'resource',
		// defaultValue: '__STRING_NOT_TRANSLATED__',
		// resource: {
		// 	loadPath: 'i18n/{{lng}}/{{ns}}.json',
		// 	savePath: 'i18n/{{lng}}/{{ns}}.json',
		// 	jsonIndent: 2,
		// 	lineEnding: '\n',
		// },
		nsSeparator: false, // namespace separator
		keySeparator: false, // key separator
		interpolation: {
			prefix: '{{',
			suffix: '}}',
		},
	},
	transform: function customTransform(file, enc, done) {
		const parser = this.parser
		const content = fs.readFileSync(file.path, enc)

		parser.parseFuncFromString(content, { list: ['i18next._', 'i18next.__'] }, (key, options) => {
			parser.set(
				key,
				Object.assign({}, options, {
					nsSeparator: false,
					keySeparator: false,
				}),
			)
		})
		done()
	},
})

const customHandler = (key, codeKeys) => codeKeys.push(key)

function getFiles(dir, files_) {
	files_ = files_ || []
	const files = fs.readdirSync(dir)
	for (let i in files) {
		const name = dir + '/' + files[i]
		if (fs.statSync(name).isDirectory()) {
			getFiles(name, files_)
		} else {
			files_.push(name)
		}
	}
	return files_
}

class EarnTranslation {
	constructor() {
		this._SPREADSHEET_ID = process.env.NODE_ENV_EARN_SPREADSHEET_ID
		this._SHEET_ID = process.env.NODE_ENV_EARN_SHEET_ID
		this._CLIENT_EMAIL = process.env.NODE_ENV_GOOGLE_CLIENT_EMAIL
		this._PRIVATE_KEY = process.env.NODE_ENV_GOOGLE_SERVICE_PRIVATE_KEY
		this._doc = new GoogleSpreadsheet(this._SPREADSHEET_ID)
		this._load = false
	}

	isOkay() {
		if (this._SPREADSHEET_ID && this._SHEET_ID && this._CLIENT_EMAIL && this._PRIVATE_KEY) {
			return true
		}
		console.error('check env')
		return false
	}

	async load() {
		if (this.isOkay()) {
			console.log('---------------------------- load')
			await this._doc.useServiceAccountAuth({
				client_email: this._CLIENT_EMAIL,
				private_key: this._PRIVATE_KEY.replace(/\\n/g, '\n'),
			})
			await this._doc.loadInfo() // loads document properties and worksheets
			this._load = true
		}
	}

	getSheet() {
		if (!this._load) {
			return
		}
		console.log('---------------------------- getSheet')
		const sheet = this._doc.sheetsById[this._SHEET_ID]
		return sheet
	}

	async download(sheet) {
		if (!this._load || !sheet) {
			console.error('download error')
			return
		}
		console.log('---------------------------- download')

		const rows = await sheet.getRows()
		// headerValue 동적 설정
		const lngs = rows[0]._sheet.headerValues.filter((v) => !(v === 'key' || v === 'isUsed' || v === ''))
		// pack 작업
		const lngsPack = {}
		lngs.forEach((lng) => {
			lngsPack[lng] = {}
		})

		rows.forEach((row) => {
			const key = row.key
			if (key) {
				lngs.forEach((lng) => {
					const value = row[lng] ? row[lng].trim() : ''
					lngsPack[lng][key.trim()] = value
				})
			}
		})
		return lngsPack
	}

	async makeJSONFromLngsPack(lngsPack) {
		if (!this._load || !lngsPack) {
			console.error('makeJSONFromLngsPack error')
			return
		}
		console.log('---------------------------- makeJSONFromLngsPack')
		const basicPath = `${appRoot.path}/public/locales`
		const lngs = Object.keys(lngsPack)

		// 폴더 생성
		if (fs.existsSync(basicPath)) {
			fs.rmSync(basicPath, { recursive: true }, (err) => {
				if (err) {
					// File deletion failed
					console.error(err.message)
					return
				}
			})
		}
		fs.mkdirSync(basicPath)
		lngs.forEach((lng) => {
			const path = `${basicPath}/${lng}`
			if (!fs.existsSync(path)) {
				fs.mkdirSync(path)
			}

			const jsonFilePath = `${path}/common.json`
			const jsonString = JSON.stringify(lngsPack[lng], null, 2)

			fs.writeFile(jsonFilePath, jsonString, 'utf8', (err) => {
				if (err) {
					throw err
				}
			})
		})
	}

	async uploadJSOMWithNewKeys(sheet) {
		if (!this._load || !sheet) {
			console.error('uploadJSOMWithNewKeys error')
			return
		}
		console.log('---------------------------- uploadJSOMWithNewKeys ----------------------------')
		try {
			// 기존 코드에서 lngs 갯수, en key 추출
			// lngs list ex:['en','ko']
			const lngs = fs.readdirSync(`${appRoot.path}/public/locales`)
			const lngJSON = lngs.reduce((acc, lng) => {
				const json = JSON.parse(fs.readFileSync(`${appRoot.path}/public/locales/${lng}/common.json`))
				acc[lng] = json
				return acc
			}, {})

			const oldKeys = Object.keys(lngJSON.en).sort()
			// Code에서 t Key 추출
			const codeKeys = []
			const pages = getFiles(`${appRoot.path}/pages`)
			const src = getFiles(`${appRoot.path}/src`)
			const filesArr = pages.concat(src)

			filesArr.forEach((fileName) => {
				const content = fs.readFileSync(fileName, 'utf-8')
				parser.parseFuncFromString(content, { list: ['t'] }, (key) => customHandler(key, codeKeys))
			})
			codeKeys.sort()

			const sheetRowsArr = []
			// 기존 JSON
			oldKeys.forEach((key) => {
				const sheetRowObj = {}
				sheetRowObj.key = key
				lngs.forEach((lng) => {
					sheetRowObj[lng] = lngJSON[lng][key]
				})
				sheetRowObj.isUsed = 'O'
				if (!codeKeys.includes(key)) {
					sheetRowObj.isUsed = 'X'
				}
				sheetRowsArr.push(sheetRowObj)
			})
			// 코드에서 추가 된 새로운 key
			codeKeys.forEach((codeKey) => {
				if (!oldKeys.includes(codeKey)) {
					const sheetRowObj = {}
					sheetRowObj.key = codeKey
					sheetRowObj.isUsed = 'O'
					sheetRowsArr.push(sheetRowObj)
				}
			})
			// clear
			await sheet.clear()
			// headerValue setting
			const newKeys = ['isUsed', 'key'].concat(lngs)
			await sheet.setHeaderRow(newKeys)
			// rows Setting
			await sheet.addRows(sheetRowsArr)
		} catch (error) {
			console.log(error)
		}
	}
}

module.exports = EarnTranslation
