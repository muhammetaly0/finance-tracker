import { useState, useEffect } from "react";
import { loadData, saveData } from "../utils/storage";

export default function useFinanceStore(){

  const [transactions,setTransactions] = useState([]);

  useEffect(()=>{

    const saved = loadData();

    if(saved){
      setTransactions(saved.transactions || []);
    }

  },[])

  useEffect(()=>{

    saveData({
      transactions
    })

  },[transactions])


  const addTransaction = (tx)=>{
    setTransactions(prev=>[...prev,tx])
  }

  return{
    transactions,
    addTransaction
  }

}