import { useState } from "react";

export default function AddModal({finance,close}){

  const [type,setType] = useState("expense");

  const handleSubmit = (e)=>{
    e.preventDefault();

    const data = new FormData(e.target);

    const tx = {
      id:Date.now(),
      name:data.get("name"),
      amount:Number(data.get("amount")),
      type,
      date:data.get("date")
    }

    finance.addTransaction(tx);

    close();
  }

  const today = new Date().toISOString().split("T")[0]

  return(

    <div className="fixed inset-0 bg-black/30 flex items-center justify-center">

      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded-3xl w-96 space-y-4"
      >

        <h2 className="text-xl font-black">
          Yeni İşlem
        </h2>

        <select
          value={type}
          onChange={e=>setType(e.target.value)}
          className="w-full p-3 bg-slate-100 rounded-xl"
        >
          <option value="expense">Gider</option>
          <option value="income">Gelir</option>
        </select>

        <input
          name="name"
          placeholder="Açıklama"
          required
          className="w-full p-3 bg-slate-100 rounded-xl"
        />

        <input
          name="amount"
          type="number"
          placeholder="Tutar"
          required
          className="w-full p-3 bg-slate-100 rounded-xl"
        />

        <input
          name="date"
          type="date"
          defaultValue={today}
          className="w-full p-3 bg-slate-100 rounded-xl"
        />

        <button className="w-full p-4 bg-indigo-600 text-white rounded-xl font-bold">
          Kaydet
        </button>

      </form>

    </div>

  )
}