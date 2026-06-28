export default function Dashboard({finance}){

  const income = finance.transactions
    .filter(t=>t.type==="income")
    .reduce((a,b)=>a+b.amount,0)

  const expense = finance.transactions
    .filter(t=>t.type==="expense")
    .reduce((a,b)=>a+b.amount,0)

  const balance = income-expense

  return(

    <div className="p-8">

      <h1 className="text-3xl font-black mb-6">
        Finans Paneli
      </h1>

      <div className="grid grid-cols-3 gap-4">

        <div className="p-6 bg-white rounded-2xl">
          <p className="text-sm text-slate-400">Gelir</p>
          <p className="text-2xl font-bold text-green-600">
            {income.toLocaleString("tr-TR")} ₺
          </p>
        </div>

        <div className="p-6 bg-white rounded-2xl">
          <p className="text-sm text-slate-400">Gider</p>
          <p className="text-2xl font-bold text-red-500">
            {expense.toLocaleString("tr-TR")} ₺
          </p>
        </div>

        <div className="p-6 bg-white rounded-2xl">
          <p className="text-sm text-slate-400">Bakiye</p>
          <p className="text-2xl font-black">
            {balance.toLocaleString("tr-TR")} ₺
          </p>
        </div>

      </div>

    </div>

  )
}